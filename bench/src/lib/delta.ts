import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { type SdkInfo } from '../context.js';
import { info, debug } from '../log.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface ViewHeader {
    columns?: ColumnData[];
    apps?: Record<string, string[]>;
}

// Columns in the header JSON have SdkInfo fields plus extra metadata
interface ColumnData extends SdkInfo {
    benchmarkDateTime?: string;
    ciRunUrl?: string;
    [key: string]: unknown;
}

interface DeltaEntry {
    app: string;
    metric: string;
    metricType: string;
    rowKey: string;
    current: number;
    previous: number;
    deltaPct: number | null;
    rollingMedian: number;
    rollingMad: number;
    sigma: number;
    significant: boolean;
    direction: 'regression' | 'improvement' | 'neutral';
}

interface DeltaMeta {
    sdkVersion: string;
    runtimeGitHash: string;
    aspnetCoreGitHash: string;
    vmrGitHash: string;
    runtimeCommitDateTime: string;
    runtimeCommitMessage: string;
    benchmarkDateTime: string;
    ciRunUrl?: string;
}

interface DeltaBaseline {
    sdkVersion: string;
    runtimeGitHash: string;
    aspnetCoreGitHash: string;
    vmrGitHash: string;
    runtimeCommitDateTime: string;
    runtimeCommitMessage: string;
    benchmarkDateTime: string;
}

interface DeltaReport {
    meta: DeltaMeta;
    baseline: DeltaBaseline;
    entries: DeltaEntry[];
    summary: {
        total: number;
        significant: number;
        regressions: number;
        improvements: number;
    };
}

interface DeltaIndexEntry {
    file: string;
    sdkVersion: string;
    runtimeGitHash: string;
    benchmarkDateTime: string;
    hasSignificant: boolean;
}

interface DeltaIndex {
    deltas: DeltaIndexEntry[];
}

// ── Column reference: bucket + column index ──────────────────────────────────

interface ColumnRef {
    weekKey: string;
    colIndex: number;
    column: ColumnData;
}

function isCustomBuild(col: ColumnData): boolean {
    return !!col.isRuntimeCustomBuild || !!col.isAspnetCoreCustomBuild;
}

// ── Metric direction & classification ────────────────────────────────────────

const HIGHER_IS_BETTER = new Set([
    'js-interop-ops', 'json-parse-ops', 'exception-ops',
    'counter-per-second', 'virtual-scroll-per-second',
    'blazor-js-to-cs-number', 'blazor-js-to-cs-string', 'blazor-js-to-cs-json',
    'blazor-cs-to-js-number', 'blazor-cs-to-js-string', 'blazor-cs-to-js-json',
    'blazor-counter-heavy-wasm', 'blazor-counter-heavy-server',
    'blazor-virtualscroll-heavy-wasm', 'blazor-virtualscroll-heavy-server',
    'blazor-params-count-wasm', 'blazor-params-count-server',
    'blazor-too-many-components-wasm', 'blazor-too-many-components-server',
    'blazor-params-count-ssr', 'blazor-too-many-components-ssr',
    'blazor-params-count-ssr-stress', 'blazor-too-many-components-ssr-stress',
    'blazor-params-count-htmlrenderer', 'blazor-too-many-components-htmlrenderer',
    'blazor-params-count-htmlrenderer-stress', 'blazor-too-many-components-htmlrenderer-stress',
    'blazor-params-count-server-stress', 'blazor-too-many-components-server-stress',
]);

function getDirection(metric: string, deltaPct: number): 'regression' | 'improvement' | 'neutral' {
    if (deltaPct === 0) return 'neutral';
    const positive = deltaPct > 0;
    if (HIGHER_IS_BETTER.has(metric)) {
        return positive ? 'improvement' : 'regression';
    }
    return positive ? 'regression' : 'improvement';
}

export type MetricType = 'compile-time' | 'size' | 'throughput' | 'timing-memory' | 'other';

export function classifyMetric(metric: string): MetricType {
    if (metric.startsWith('compile-time')) return 'compile-time';
    if (metric.startsWith('disk-size') || metric.startsWith('download-size')) return 'size';
    if (metric.includes('-ops') || metric.includes('-per-second') || metric.startsWith('blazor-')) return 'throughput';
    if (metric.startsWith('time-to') || metric.startsWith('memory')) return 'timing-memory';
    return 'other';
}

// ── MAD-based statistics ─────────────────────────────────────────────────────

function medianOf(arr: number[]): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median Absolute Deviation */
function madOf(arr: number[]): number {
    const med = medianOf(arr);
    return medianOf(arr.map(v => Math.abs(v - med)));
}

/** MAD-based sigma: |x - median| / (MAD × 1.4826). 1.4826 = consistency constant for normal. */
function madSigma(value: number, windowValues: number[]): { sigma: number; median: number; mad: number } {
    const med = medianOf(windowValues);
    const m = madOf(windowValues);
    if (m === 0) {
        return { sigma: value !== med ? Infinity : 0, median: med, mad: 0 };
    }
    return { sigma: Math.abs(value - med) / (m * 1.4826), median: med, mad: m };
}

// ── Per-metric-type asymmetric sigma thresholds ──────────────────────────────
// Calibrated from historical data to yield ~9 regressions + ~3 improvements per week.
// Regression thresholds are lower (more sensitive) than improvement thresholds.

interface SigmaThreshold {
    regression: number;
    improvement: number;
}

const METRIC_THRESHOLDS: Record<MetricType, SigmaThreshold> = {
    'compile-time': { regression: 5, improvement: 8 },
    'size': { regression: 8, improvement: 15 },
    'throughput': { regression: 7, improvement: 15 },
    'timing-memory': { regression: 10, improvement: 20 },
    'other': { regression: 8, improvement: 15 },
};

/** For MAD=0 (deterministic) metrics, require at least this |Δ%| to flag at all. */
const MAD_ZERO_MIN_DELTA_PCT = 1.0;

/** Metrics excluded from delta analysis (too noisy to be useful). */
const EXCLUDED_METRICS = new Set(['memory-peak']);

/** Hard cap: keep at most this many regressions per build. */
const MAX_REGRESSIONS_PER_BUILD = 2;
/** Hard cap: keep at most this many improvements per build. */
const MAX_IMPROVEMENTS_PER_BUILD = 1;

// ── Public API ───────────────────────────────────────────────────────────────

const ROLLING_WINDOW = 20;

export async function computeAndWriteDelta(
    viewsDir: string,
    sdkInfo: SdkInfo,
    weekKeys: string[],
    verbose: boolean,
): Promise<void> {
    if (weekKeys.length === 0) {
        info('Delta: no week buckets — skipping');
        return;
    }

    // Load all week headers (sorted newest first — weekKeys order)
    const headers = new Map<string, ViewHeader>();
    for (const week of weekKeys) {
        const headerPath = join(viewsDir, week, 'header.json');
        if (existsSync(headerPath)) {
            const h = JSON.parse(await readFile(headerPath, 'utf-8')) as ViewHeader;
            headers.set(week, h);
        }
    }

    // Build flat list of all columns across all weeks, sorted chronologically (oldest first)
    const allColumns: ColumnRef[] = [];
    for (const week of [...weekKeys].reverse()) {
        const header = headers.get(week);
        if (!header?.columns) continue;
        for (let i = 0; i < header.columns.length; i++) {
            allColumns.push({ weekKey: week, colIndex: i, column: header.columns[i] });
        }
    }

    if (allColumns.length < ROLLING_WINDOW + 1) {
        info(`Delta: only ${allColumns.length} columns across all weeks (need ${ROLLING_WINDOW + 1}) — skipping`);
        return;
    }

    // Find current column: match by sdkVersion
    const currentIdx = findCurrentColumn(allColumns, sdkInfo);
    if (currentIdx < 0) {
        info(`Delta: current SDK ${sdkInfo.sdkVersion} not found in week views — skipping`);
        return;
    }

    // Previous column: the nearest non-custom-build column before current
    // (for PR builds, baseline is the last daily build)
    let prevIdx = currentIdx - 1;
    while (prevIdx >= 0 && isCustomBuild(allColumns[prevIdx].column)) {
        prevIdx--;
    }
    if (prevIdx < 0) {
        info('Delta: no non-custom-build baseline found before current — skipping');
        return;
    }

    // Rolling window: up to ROLLING_WINDOW non-custom-build columns before current
    const windowRefs: ColumnRef[] = [];
    for (let i = currentIdx - 1; i >= 0 && windowRefs.length < ROLLING_WINDOW; i--) {
        if (!isCustomBuild(allColumns[i].column)) {
            windowRefs.unshift(allColumns[i]);
        }
    }
    if (windowRefs.length < ROLLING_WINDOW) {
        info(`Delta: only ${windowRefs.length} daily builds before current (need ${ROLLING_WINDOW}) — skipping`);
        return;
    }

    const currentRef = allColumns[currentIdx];
    const prevRef = allColumns[prevIdx];

    if (verbose) {
        debug(`Delta: current=${currentRef.column.sdkVersion} (${currentRef.weekKey}[${currentRef.colIndex}])`);
        debug(`Delta: previous=${prevRef.column.sdkVersion} (${prevRef.weekKey}[${prevRef.colIndex}])`);
        debug(`Delta: rolling window: ${windowRefs.length} columns`);
    }

    // Collect all app+metric combinations from the current week bucket
    const currentHeader = headers.get(currentRef.weekKey)!;
    const appMetrics: { app: string; metric: string }[] = [];
    for (const [app, metrics] of Object.entries(currentHeader.apps || {})) {
        for (const metric of metrics) {
            appMetrics.push({ app, metric });
        }
    }

    // For each app+metric, load data and compute deltas
    const rawEntries: DeltaEntry[] = [];

    for (const { app, metric } of appMetrics) {
        if (EXCLUDED_METRICS.has(metric)) continue;

        // Load current bucket data
        const currentData = await loadMetricData(viewsDir, currentRef.weekKey, app, metric);
        if (!currentData) continue;

        // Load previous bucket data (may be in different week)
        const prevData = await loadMetricData(viewsDir, prevRef.weekKey, app, metric);

        // Load rolling window data from all relevant weeks
        const windowDataByWeek = new Map<string, Record<string, (number | null)[]>>();
        const windowWeeks = new Set(windowRefs.map(r => r.weekKey));
        for (const week of windowWeeks) {
            const d = await loadMetricData(viewsDir, week, app, metric);
            if (d) windowDataByWeek.set(week, d);
        }

        const mtype = classifyMetric(metric);
        const thresholds = METRIC_THRESHOLDS[mtype];

        // Iterate over all rowKeys in the current data
        for (const [rowKey, values] of Object.entries(currentData)) {
            const currentValue = values[currentRef.colIndex];
            if (currentValue == null) continue;

            // Get previous value
            const prevValue = prevData?.[rowKey]?.[prevRef.colIndex] ?? null;
            if (prevValue == null) continue;

            // Collect rolling window values
            const windowValues: number[] = [];
            for (const ref of windowRefs) {
                const weekData = windowDataByWeek.get(ref.weekKey);
                const val = weekData?.[rowKey]?.[ref.colIndex];
                if (val != null) windowValues.push(val);
            }

            if (windowValues.length < ROLLING_WINDOW) continue;

            // Compute MAD-based stats
            const { sigma, median: rollingMedian, mad: rollingMad } = madSigma(currentValue, windowValues);

            const deltaPct = prevValue !== 0 ? ((currentValue - prevValue) / prevValue) * 100 : null;
            const direction = deltaPct != null ? getDirection(metric, deltaPct) : 'neutral';

            // For MAD=0 entries, require minimum |Δ%| to avoid flagging trivial jitter
            if (rollingMad === 0 && (deltaPct == null || Math.abs(deltaPct) < MAD_ZERO_MIN_DELTA_PCT)) {
                continue;
            }

            // Apply per-metric-type asymmetric sigma threshold
            const threshold = direction === 'regression' ? thresholds.regression : thresholds.improvement;
            const significant = sigma > threshold;

            rawEntries.push({
                app,
                metric,
                metricType: mtype,
                rowKey,
                current: currentValue,
                previous: prevValue,
                deltaPct: deltaPct != null ? Math.round(deltaPct * 100) / 100 : null,
                rollingMedian: Math.round(rollingMedian * 100) / 100,
                rollingMad: Math.round(rollingMad * 100) / 100,
                sigma: isFinite(sigma) ? Math.round(sigma * 100) / 100 : sigma,
                significant,
                direction,
            });
        }
    }

    // Dedup: per (app, metric), keep only the rowKey with the highest sigma
    const dedupMap = new Map<string, DeltaEntry>();
    for (const entry of rawEntries) {
        const key = `${entry.app}/${entry.metric}`;
        const existing = dedupMap.get(key);
        if (!existing || entry.sigma > existing.sigma) {
            dedupMap.set(key, entry);
        }
    }
    const dedupEntries = [...dedupMap.values()];

    // Apply hard cap: top N regressions + top M improvements by sigma, rest not significant
    const sigRegressions = dedupEntries.filter(e => e.significant && e.direction === 'regression')
        .sort((a, b) => b.sigma - a.sigma);
    const sigImprovements = dedupEntries.filter(e => e.significant && e.direction === 'improvement')
        .sort((a, b) => b.sigma - a.sigma);

    const cappedRegSet = new Set(sigRegressions.slice(0, MAX_REGRESSIONS_PER_BUILD));
    const cappedImpSet = new Set(sigImprovements.slice(0, MAX_IMPROVEMENTS_PER_BUILD));

    const entries: DeltaEntry[] = dedupEntries.map(e => {
        if (e.significant && !cappedRegSet.has(e) && !cappedImpSet.has(e)) {
            return { ...e, significant: false };
        }
        return e;
    });

    const significantEntries = entries.filter(e => e.significant);
    const regressions = significantEntries.filter(e => e.direction === 'regression').length;
    const improvements = significantEntries.filter(e => e.direction === 'improvement').length;

    const report: DeltaReport = {
        meta: {
            sdkVersion: currentRef.column.sdkVersion,
            runtimeGitHash: currentRef.column.runtimeGitHash,
            aspnetCoreGitHash: currentRef.column.aspnetCoreGitHash,
            vmrGitHash: currentRef.column.vmrGitHash,
            runtimeCommitDateTime: currentRef.column.runtimeCommitDateTime,
            runtimeCommitMessage: currentRef.column.runtimeCommitMessage ?? '',
            benchmarkDateTime: currentRef.column.benchmarkDateTime ?? new Date().toISOString(),
            ...(currentRef.column.ciRunUrl ? { ciRunUrl: currentRef.column.ciRunUrl } : {}),
        },
        baseline: {
            sdkVersion: prevRef.column.sdkVersion,
            runtimeGitHash: prevRef.column.runtimeGitHash,
            aspnetCoreGitHash: prevRef.column.aspnetCoreGitHash,
            vmrGitHash: prevRef.column.vmrGitHash,
            runtimeCommitDateTime: prevRef.column.runtimeCommitDateTime,
            runtimeCommitMessage: prevRef.column.runtimeCommitMessage ?? '',
            benchmarkDateTime: prevRef.column.benchmarkDateTime ?? '',
        },
        entries,
        summary: {
            total: entries.length,
            significant: significantEntries.length,
            regressions,
            improvements,
        },
    };

    info(`Delta: ${entries.length} entries (deduped from ${rawEntries.length}), ${significantEntries.length} significant (${regressions} regressions, ${improvements} improvements)`);
    await writeDelta(viewsDir, report);
}

// ── Write delta file and update index ────────────────────────────────────────

async function writeDelta(viewsDir: string, report: DeltaReport): Promise<void> {
    const deltaDir = join(viewsDir, 'delta');
    await mkdir(deltaDir, { recursive: true });

    const runtimeHash7 = report.meta.runtimeGitHash.slice(0, 7);
    const aspnetHash7 = report.meta.aspnetCoreGitHash.slice(0, 7);
    const filename = `delta-${report.meta.sdkVersion}-${runtimeHash7}-${aspnetHash7}.json`;

    await writeFile(join(deltaDir, filename), JSON.stringify(report, null, 2), 'utf-8');
    info(`Delta: wrote ${filename}`);

    // Update index
    const indexPath = join(deltaDir, 'index.json');
    let index: DeltaIndex = { deltas: [] };
    if (existsSync(indexPath)) {
        index = JSON.parse(await readFile(indexPath, 'utf-8')) as DeltaIndex;
    }

    // Remove existing entry for same SDK version (re-run)
    index.deltas = index.deltas.filter(d => d.sdkVersion !== report.meta.sdkVersion);

    // Add new entry at the front (newest first)
    index.deltas.unshift({
        file: filename,
        sdkVersion: report.meta.sdkVersion,
        runtimeGitHash: report.meta.runtimeGitHash,
        benchmarkDateTime: report.meta.benchmarkDateTime,
        hasSignificant: report.summary.significant > 0,
    });

    await writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
    info(`Delta: updated index.json (${index.deltas.length} entries)`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findCurrentColumn(allColumns: ColumnRef[], sdkInfo: SdkInfo): number {
    // Prefer exact vmrGitHash match, fall back to sdkVersion match
    let idx = allColumns.findIndex(c => c.column.vmrGitHash === sdkInfo.vmrGitHash);
    if (idx >= 0) return idx;
    idx = allColumns.findIndex(c => c.column.sdkVersion === sdkInfo.sdkVersion);
    return idx;
}

async function loadMetricData(
    viewsDir: string,
    weekKey: string,
    app: string,
    metric: string,
): Promise<Record<string, (number | null)[]> | null> {
    const filePath = join(viewsDir, weekKey, `${app}_${metric}.json`);
    if (!existsSync(filePath)) return null;
    return JSON.parse(await readFile(filePath, 'utf-8')) as Record<string, (number | null)[]>;
}
