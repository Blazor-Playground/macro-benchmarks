// One-off script: regenerate delta reports for all existing preview builds.
// Uses the same algorithm as delta.ts: MAD, window 20, per-metric asymmetric thresholds,
// dedup, hard cap.
//
// Usage: npx tsx bench/src/scripts/backfill-deltas.ts

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { classifyMetric, type MetricType } from '../lib/delta.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface SdkInfo {
    sdkVersion: string;
    runtimeGitHash: string;
    aspnetCoreGitHash: string;
    sdkGitHash: string;
    vmrGitHash: string;
    runtimeCommitDateTime: string;
    runtimeCommitAuthor: string;
    runtimeCommitMessage: string;
    [key: string]: unknown;
}

interface ViewHeader {
    columns?: SdkInfo[];
    apps?: Record<string, string[]>;
}

interface ColumnRef {
    weekKey: string;
    colIndex: number;
    column: SdkInfo;
}

function isCustomBuild(col: SdkInfo): boolean {
    return !!col.isRuntimeCustomBuild || !!col.isAspnetCoreCustomBuild;
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

interface DeltaReport {
    meta: Record<string, unknown>;
    baseline: Record<string, unknown>;
    entries: DeltaEntry[];
    summary: { total: number; significant: number; regressions: number; improvements: number };
}

interface DeltaIndexEntry {
    file: string;
    sdkVersion: string;
    runtimeGitHash: string;
    benchmarkDateTime: string;
    hasSignificant: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ROLLING_WINDOW = 20;
const MAD_ZERO_MIN_DELTA_PCT = 1.0;
const EXCLUDED_METRICS = new Set(['memory-peak']);
const MAX_REGRESSIONS_PER_BUILD = 2;
const MAX_IMPROVEMENTS_PER_BUILD = 1;

const HIGHER_IS_BETTER = new Set([
    'js-interop-ops', 'json-parse-ops', 'exception-ops',
    'counter-per-second',
    'blazor-js-to-cs-number', 'blazor-js-to-cs-string', 'blazor-js-to-cs-json',
    'blazor-cs-to-js-number', 'blazor-cs-to-js-string', 'blazor-cs-to-js-json',
]);

interface SigmaThreshold { regression: number; improvement: number; }

const METRIC_THRESHOLDS: Record<MetricType, SigmaThreshold> = {
    'compile-time': { regression: 5, improvement: 8 },
    'size': { regression: 8, improvement: 15 },
    'throughput': { regression: 7, improvement: 15 },
    'timing-memory': { regression: 10, improvement: 20 },
    'other': { regression: 8, improvement: 15 },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDirection(metric: string, deltaPct: number): 'regression' | 'improvement' | 'neutral' {
    if (deltaPct === 0) return 'neutral';
    const positive = deltaPct > 0;
    return HIGHER_IS_BETTER.has(metric)
        ? (positive ? 'improvement' : 'regression')
        : (positive ? 'regression' : 'improvement');
}

function medianOf(arr: number[]): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function madOf(arr: number[]): number {
    const med = medianOf(arr);
    return medianOf(arr.map(v => Math.abs(v - med)));
}

function madSigma(value: number, windowValues: number[]): { sigma: number; median: number; mad: number } {
    const med = medianOf(windowValues);
    const m = madOf(windowValues);
    if (m === 0) return { sigma: value !== med ? Infinity : 0, median: med, mad: 0 };
    return { sigma: Math.abs(value - med) / (m * 1.4826), median: med, mad: m };
}

// ── Metric data loader with cache ────────────────────────────────────────────

const dataCache = new Map<string, Record<string, (number | null)[]> | null>();

async function loadMetricData(
    viewsDir: string, weekKey: string, app: string, metric: string,
): Promise<Record<string, (number | null)[]> | null> {
    const key = `${weekKey}/${app}_${metric}`;
    if (dataCache.has(key)) return dataCache.get(key)!;
    const filePath = join(viewsDir, weekKey, `${app}_${metric}.json`);
    if (!existsSync(filePath)) { dataCache.set(key, null); return null; }
    const data = JSON.parse(await readFile(filePath, 'utf-8'));
    dataCache.set(key, data);
    return data;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const repoRoot = join(import.meta.dirname!, '..', '..', '..');
    const viewsDir = join(repoRoot, 'gh-pages', 'data', 'views');

    if (!existsSync(viewsDir)) {
        console.error(`Views dir not found: ${viewsDir}`);
        process.exit(1);
    }

    // Discover week directories
    const entries = await readdir(viewsDir, { withFileTypes: true });
    const weekKeys = entries
        .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
        .map(e => e.name).sort().reverse();

    console.log(`Found ${weekKeys.length} week buckets: ${weekKeys.join(', ')}`);

    // Load all headers
    const headers = new Map<string, ViewHeader>();
    for (const week of weekKeys) {
        const headerPath = join(viewsDir, week, 'header.json');
        if (existsSync(headerPath)) {
            headers.set(week, JSON.parse(await readFile(headerPath, 'utf-8')));
        }
    }

    // Build flat chronological column list (oldest first)
    const allColumns: ColumnRef[] = [];
    for (const week of [...weekKeys].reverse()) {
        const header = headers.get(week);
        if (!header?.columns) continue;
        for (let i = 0; i < header.columns.length; i++) {
            allColumns.push({ weekKey: week, colIndex: i, column: header.columns[i] });
        }
    }

    console.log(`Total columns: ${allColumns.length}`);
    if (allColumns.length < ROLLING_WINDOW + 1) {
        console.log(`Need at least ${ROLLING_WINDOW + 1} columns — nothing to do.`);
        return;
    }

    const deltaDir = join(viewsDir, 'delta');
    await mkdir(deltaDir, { recursive: true });

    const indexEntries: DeltaIndexEntry[] = [];
    let generated = 0;
    let skipped = 0;

    for (let ci = ROLLING_WINDOW; ci < allColumns.length; ci++) {
        const currentRef = allColumns[ci];

        // Find previous non-custom-build column
        let prevIdx = ci - 1;
        while (prevIdx >= 0 && isCustomBuild(allColumns[prevIdx].column)) {
            prevIdx--;
        }
        if (prevIdx < 0) continue;
        const prevRef = allColumns[prevIdx];

        // Collect rolling window of non-custom-build columns
        const windowRefs: ColumnRef[] = [];
        for (let i = ci - 1; i >= 0 && windowRefs.length < ROLLING_WINDOW; i--) {
            if (!isCustomBuild(allColumns[i].column)) {
                windowRefs.unshift(allColumns[i]);
            }
        }
        if (windowRefs.length < ROLLING_WINDOW) continue;

        const currentHeader = headers.get(currentRef.weekKey)!;
        const appMetrics: { app: string; metric: string }[] = [];
        for (const [app, metrics] of Object.entries(currentHeader.apps || {})) {
            for (const metric of metrics) {
                appMetrics.push({ app, metric });
            }
        }

        const rawEntries: DeltaEntry[] = [];

        for (const { app, metric } of appMetrics) {
            if (EXCLUDED_METRICS.has(metric)) continue;

            const currentData = await loadMetricData(viewsDir, currentRef.weekKey, app, metric);
            if (!currentData) continue;
            const prevData = await loadMetricData(viewsDir, prevRef.weekKey, app, metric);

            const windowDataByWeek = new Map<string, Record<string, (number | null)[]>>();
            for (const week of new Set(windowRefs.map(r => r.weekKey))) {
                const d = await loadMetricData(viewsDir, week, app, metric);
                if (d) windowDataByWeek.set(week, d);
            }

            const mtype = classifyMetric(metric);
            const thresholds = METRIC_THRESHOLDS[mtype];

            for (const [rowKey, values] of Object.entries(currentData)) {
                const currentValue = values[currentRef.colIndex];
                if (currentValue == null) continue;

                const prevValue = prevData?.[rowKey]?.[prevRef.colIndex] ?? null;
                if (prevValue == null) continue;

                const windowValues: number[] = [];
                for (const ref of windowRefs) {
                    const weekData = windowDataByWeek.get(ref.weekKey);
                    const val = weekData?.[rowKey]?.[ref.colIndex];
                    if (val != null) windowValues.push(val);
                }
                if (windowValues.length < ROLLING_WINDOW) continue;

                const { sigma, median: rollingMedian, mad: rollingMad } = madSigma(currentValue, windowValues);

                const deltaPct = prevValue !== 0 ? ((currentValue - prevValue) / prevValue) * 100 : null;
                const direction = deltaPct != null ? getDirection(metric, deltaPct) : 'neutral';

                // MAD=0: require minimum |Δ%|
                if (rollingMad === 0 && (deltaPct == null || Math.abs(deltaPct) < MAD_ZERO_MIN_DELTA_PCT)) {
                    continue;
                }

                const threshold = direction === 'regression' ? thresholds.regression : thresholds.improvement;
                const significant = sigma > threshold;

                rawEntries.push({
                    app, metric, metricType: mtype, rowKey,
                    current: currentValue,
                    previous: prevValue,
                    deltaPct: deltaPct != null ? Math.round(deltaPct * 100) / 100 : null,
                    rollingMedian: Math.round(rollingMedian * 100) / 100,
                    rollingMad: Math.round(rollingMad * 100) / 100,
                    sigma: isFinite(sigma) ? Math.round(sigma * 100) / 100 : sigma,
                    significant, direction,
                });
            }
        }

        // Dedup: per (app, metric), keep rowKey with highest sigma
        const dedupMap = new Map<string, DeltaEntry>();
        for (const entry of rawEntries) {
            const key = `${entry.app}/${entry.metric}`;
            const existing = dedupMap.get(key);
            if (!existing || entry.sigma > existing.sigma) dedupMap.set(key, entry);
        }
        const dedupEntries = [...dedupMap.values()];

        // Hard cap
        const sigReg = dedupEntries.filter(e => e.significant && e.direction === 'regression')
            .sort((a, b) => b.sigma - a.sigma);
        const sigImp = dedupEntries.filter(e => e.significant && e.direction === 'improvement')
            .sort((a, b) => b.sigma - a.sigma);
        const cappedReg = new Set(sigReg.slice(0, MAX_REGRESSIONS_PER_BUILD));
        const cappedImp = new Set(sigImp.slice(0, MAX_IMPROVEMENTS_PER_BUILD));

        const finalEntries = dedupEntries.map(e => {
            if (e.significant && !cappedReg.has(e) && !cappedImp.has(e)) {
                return { ...e, significant: false };
            }
            return e;
        });

        if (finalEntries.length === 0) {
            skipped++;
            continue;
        }

        const sigEntries = finalEntries.filter(e => e.significant);
        const regressions = sigEntries.filter(e => e.direction === 'regression').length;
        const improvements = sigEntries.filter(e => e.direction === 'improvement').length;

        const col = currentRef.column;
        const runtimeHash7 = col.runtimeGitHash.slice(0, 7);
        const aspnetHash7 = (col.aspnetCoreGitHash || '').slice(0, 7);
        const filename = `delta-${col.sdkVersion}-${runtimeHash7}-${aspnetHash7}.json`;

        const report: DeltaReport = {
            meta: {
                sdkVersion: col.sdkVersion,
                runtimeGitHash: col.runtimeGitHash,
                aspnetCoreGitHash: col.aspnetCoreGitHash || '',
                vmrGitHash: col.vmrGitHash || '',
                runtimeCommitDateTime: col.runtimeCommitDateTime,
                runtimeCommitMessage: col.runtimeCommitMessage ?? '',
                benchmarkDateTime: col.benchmarkDateTime ?? '',
                ...(col.ciRunUrl ? { ciRunUrl: col.ciRunUrl } : {}),
            },
            baseline: {
                sdkVersion: prevRef.column.sdkVersion,
                runtimeGitHash: prevRef.column.runtimeGitHash,
                aspnetCoreGitHash: prevRef.column.aspnetCoreGitHash ?? '',
                vmrGitHash: prevRef.column.vmrGitHash ?? '',
                runtimeCommitDateTime: prevRef.column.runtimeCommitDateTime,
                runtimeCommitMessage: prevRef.column.runtimeCommitMessage ?? '',
                benchmarkDateTime: prevRef.column.benchmarkDateTime ?? '',
            },
            entries: finalEntries,
            summary: { total: finalEntries.length, significant: sigEntries.length, regressions, improvements },
        };

        await writeFile(join(deltaDir, filename), JSON.stringify(report, null, 2), 'utf-8');

        indexEntries.push({
            file: filename,
            sdkVersion: col.sdkVersion,
            runtimeGitHash: col.runtimeGitHash,
            benchmarkDateTime: col.benchmarkDateTime as string ?? col.runtimeCommitDateTime,
            hasSignificant: sigEntries.length > 0,
        });

        generated++;
        const sigLabel = sigEntries.length > 0 ? ` (${regressions}R ${improvements}I)` : '';
        console.log(`  [${ci}/${allColumns.length - 1}] ${col.sdkVersion} → ${finalEntries.length} deduped, ${sigEntries.length} significant${sigLabel}`);
    }

    // Write index (newest first)
    indexEntries.reverse();
    await writeFile(join(deltaDir, 'index.json'), JSON.stringify({ deltas: indexEntries }, null, 2), 'utf-8');

    console.log(`\nDone: ${generated} delta reports generated, ${skipped} skipped, index has ${indexEntries.length} entries.`);
}

main().catch(e => { console.error(e); process.exit(1); });
