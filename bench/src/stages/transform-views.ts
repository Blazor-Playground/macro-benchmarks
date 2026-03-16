import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { type BenchContext, type SdkInfo } from '../context.js';
import { banner, info, debug } from '../log.js';
import { ensureBranchCheckout } from '../lib/branch-checkout.js';
import { isPrerelease, getVersionMajor, compareVersions } from '../lib/version-utils.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface ResultFile {
    meta: SdkInfo & {
        runtime: string;
        preset: string;
        profile: string;
        engine: string;
        app: string;
        [key: string]: unknown;
    };
    metrics: Record<string, number>;
}

interface LoadedResult extends SdkInfo {
    rowKey: string;
    app: string;
    metrics: Record<string, number>;
}

interface ViewHeader {
    columns?: SdkInfo[];
    apps?: Record<string, string[]>;
    week?: string;
    release?: string;
}

interface ViewIndex {
    lastUpdated?: string;
    activeRelease?: string;
    releases?: string[];
    weeks?: string[];
    apps?: string[];
    metrics?: Record<string, string[]>;
    dimensions?: {
        runtimes?: string[];
        presets?: string[];
        profiles?: string[];
        engines?: string[];
    };
}

// ── Stage Entry ──────────────────────────────────────────────────────────────

export async function run(ctx: BenchContext): Promise<BenchContext> {
    await ensureBranchCheckout(ctx.repoRoot, 'gh-pages', 'gh-pages', {
        verbose: ctx.verbose,
        sparsePaths: ['data'],
    });

    const viewsDir = join(ctx.repoRoot, 'gh-pages', 'data', 'views');
    const results = await loadResults(ctx);
    await buildViews(ctx, results, viewsDir);

    return ctx;
}

// ── Result Loading ───────────────────────────────────────────────────────────

async function loadResults(ctx: BenchContext): Promise<LoadedResult[]> {
    banner('Load results');

    const resultsDir = ctx.artifactsInputDir || ctx.resultsDir;
    if (!resultsDir || !existsSync(resultsDir)) {
        info('No results directory — skipping view generation');
        return [];
    }

    const resultFiles = await findResultFiles(resultsDir);
    if (resultFiles.length === 0) {
        info('No result files found');
        return [];
    }

    const results: LoadedResult[] = [];

    for (const { path: filepath, filename } of resultFiles) {
        const raw = await readFile(filepath, 'utf-8');
        const data: ResultFile = JSON.parse(raw);
        const m = data.meta;

        requireField(m.runtimeGitHash, 'runtimeGitHash', filename);
        requireField(m.runtimeCommitDateTime, 'runtimeCommitDateTime', filename);
        requireField(m.runtime, 'runtime', filename);
        requireField(m.preset, 'preset', filename);
        requireField(m.profile, 'profile', filename);
        requireField(m.engine, 'engine', filename);
        requireField(m.app, 'app', filename);
        if (!m.sdkVersion || m.sdkVersion === 'unknown') {
            throw new Error(`Missing or unknown sdkVersion in ${filename}`);
        }

        const { runtime, preset, profile: rawProfile, engine, app, ...sdkFields } = m;
        const profile = rawProfile || 'desktop';
        results.push({
            ...sdkFields,
            rowKey: `${runtime}/${preset}/${profile}/${engine}`,
            app,
            metrics: data.metrics,
        });
    }

    if (ctx.verbose) {
        debug(`Loaded ${results.length} results from ${resultFiles.length} files`);
        const apps = new Set(results.map(r => r.app));
        const sdks = new Set(results.map(r => r.sdkVersion));
        debug(`  apps: ${[...apps].sort().join(', ')}`);
        debug(`  SDK versions: ${[...sdks].sort().join(', ')}`);
    }
    return results;
}

async function findResultFiles(dir: string): Promise<{ path: string; filename: string }[]> {
    const SKIP = new Set(['build-manifest.json', 'sdk-info.json', 'index.json']);
    const results: { path: string; filename: string }[] = [];

    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return results;
    }

    for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.json') && !SKIP.has(entry.name)) {
            results.push({ path: join(dir, entry.name), filename: entry.name });
        } else if (entry.isDirectory()) {
            const sub = await findResultFiles(join(dir, entry.name));
            results.push(...sub);
        }
    }
    return results;
}

function requireField(value: unknown, name: string, filename: string): asserts value is string {
    if (!value || typeof value !== 'string') {
        throw new Error(`Missing ${name} in ${filename}`);
    }
}

// ── Build Views ──────────────────────────────────────────────────────────────

async function buildViews(ctx: BenchContext, allResults: LoadedResult[], viewsDir: string): Promise<void> {
    banner('Build views');

    if (allResults.length === 0) {
        info('No results to build views from');
        return;
    }

    // Split results: daily builds (prerelease SDK) vs GA releases (stable SDK)
    const dailyResults = allResults.filter(r => isPrerelease(r.sdkVersion));
    const releaseResults = allResults.filter(r => !isPrerelease(r.sdkVersion));

    // Week views: only the highest-major daily builds
    const dailyMajors = [...new Set(dailyResults.map(r => getVersionMajor(r.sdkVersion)))];
    const activeDailyMajor = dailyMajors.length > 0 ? Math.max(...dailyMajors) : 0;
    const activeRelease = activeDailyMajor > 0 ? `net${activeDailyMajor}` : '';

    if (ctx.verbose) {
        debug(`Active daily release: ${activeRelease || '(none)'}`);
        debug(`Daily results: ${dailyResults.length}, release results: ${releaseResults.length}`);
    }

    // Bucket results
    const weekBuckets = new Map<string, LoadedResult[]>();
    const releaseBuckets = new Map<string, LoadedResult[]>();

    for (const result of dailyResults) {
        if (getVersionMajor(result.sdkVersion) !== activeDailyMajor) continue;
        const week = getWeekMonday(result.runtimeCommitDateTime.slice(0, 10));
        if (!weekBuckets.has(week)) weekBuckets.set(week, []);
        weekBuckets.get(week)!.push(result);
    }

    for (const result of releaseResults) {
        const release = `net${getVersionMajor(result.sdkVersion)}`;
        if (!releaseBuckets.has(release)) releaseBuckets.set(release, []);
        releaseBuckets.get(release)!.push(result);
    }

    // Write week views
    const weekKeys = [...weekBuckets.keys()].sort().reverse();
    for (const week of weekKeys) {
        await writeBucketView(join(viewsDir, week), weekBuckets.get(week)!, 'week', week, ctx);
    }

    // Write release views
    const releaseKeys = [...releaseBuckets.keys()].sort(compareNetLabel);
    for (const release of releaseKeys) {
        await writeBucketView(
            join(viewsDir, 'releases', release),
            releaseBuckets.get(release)!, 'release', release, ctx,
        );
    }

    // Write global views index LAST (makes update atomic from UI perspective)
    const existingIndex = await readJsonIfExists<ViewIndex>(join(viewsDir, 'index.json'));
    const currentIndex = buildViewIndex(allResults, activeRelease, weekKeys, releaseKeys);
    const viewIndex = mergeViewIndex(existingIndex, currentIndex);
    await mkdir(viewsDir, { recursive: true });
    await writeFile(join(viewsDir, 'index.json'), JSON.stringify(viewIndex, null, 2), 'utf-8');
    if (ctx.verbose) {
        debug(`  wrote views/index.json`);
        if (existingIndex) {
            const existingWeeks = existingIndex.weeks?.length || 0;
            const existingReleases = existingIndex.releases?.length || 0;
            const mergedWeeks = viewIndex.weeks?.length || 0;
            const mergedReleases = viewIndex.releases?.length || 0;
            debug(`  index merge: weeks ${existingWeeks}→${mergedWeeks}, releases ${existingReleases}→${mergedReleases}`);
        }
    }

    info(`Views: ${weekKeys.length} weeks, ${releaseKeys.length} releases`);
}

// ── Unified Bucket Writer ────────────────────────────────────────────────────

async function writeBucketView(
    dir: string,
    results: LoadedResult[],
    type: 'week' | 'release',
    label: string,
    ctx: BenchContext,
): Promise<void> {
    await mkdir(dir, { recursive: true });

    const columnKey = type === 'week'
        ? (r: LoadedResult) => r.vmrGitHash
        : (r: LoadedResult) => r.sdkVersion;
    const getColumnId = type === 'week'
        ? (column: SdkInfo) => column.vmrGitHash
        : (column: SdkInfo) => column.sdkVersion;

    // Deduplicate columns
    const columnMap = new Map<string, SdkInfo>();
    for (const r of results) {
        const key = columnKey(r);
        if (!columnMap.has(key)) {
            const { rowKey, app, metrics, ...column } = r;
            columnMap.set(key, column);
        }
    }

    const existingHeader = await readJsonIfExists<ViewHeader>(join(dir, 'header.json'));
    const existingColumnCount = existingHeader?.columns?.length || 0;
    const newColumnsBefore = columnMap.size;
    for (const column of existingHeader?.columns || []) {
        const key = getColumnId(column);
        if (!columnMap.has(key)) {
            columnMap.set(key, column);
        }
    }
    if (ctx.verbose && existingHeader) {
        const keptFromExisting = columnMap.size - newColumnsBefore;
        debug(`  ${type} ${label}: merging ${newColumnsBefore} new columns with ${existingColumnCount} existing (${keptFromExisting} unique from existing)`);
    }

    // Sort columns
    const columns: SdkInfo[] = type === 'week'
        ? [...columnMap.values()].sort((a, b) =>
            a.runtimeCommitDateTime.localeCompare(b.runtimeCommitDateTime)
            || a.sdkVersion.localeCompare(b.sdkVersion))
        : [...columnMap.values()].sort((a, b) =>
            compareSdkVersion(a.sdkVersion, b.sdkVersion));

    const colIndex = new Map(columns.map((c, i) => [
        type === 'week' ? c.vmrGitHash : c.sdkVersion, i,
    ]));

    // Build grid: app → metric → rowKey → values[]
    // For build-time and size metrics, only keep chrome/desktop to avoid redundant rows
    const BUILD_SIZE_METRICS = new Set([
        'compile-time', 'disk-size-native',
        'disk-size-assemblies', 'download-size-total',
    ]);
    const grid = new Map<string, Map<string, Map<string, (number | null)[]>>>();

    for (const r of results) {
        const ci = colIndex.get(columnKey(r))!;
        for (const [metricKey, value] of Object.entries(r.metrics)) {
            // Only include chrome/desktop for build-time and size metrics
            if (BUILD_SIZE_METRICS.has(metricKey) && !r.rowKey.endsWith('/desktop/chrome')) continue;

            if (!grid.has(r.app)) grid.set(r.app, new Map());
            const metricMap = grid.get(r.app)!;
            if (!metricMap.has(metricKey)) metricMap.set(metricKey, new Map());
            const rowMap = metricMap.get(metricKey)!;
            if (!rowMap.has(r.rowKey)) {
                rowMap.set(r.rowKey, new Array(columns.length).fill(null));
            }
            rowMap.get(r.rowKey)![ci] = Math.round(value);
        }
    }

    // Write data files and collect app manifest
    const appsManifest: Record<string, string[]> = {};

    for (const [app, metricMap] of grid) {
        appsManifest[app] = [];
    }

    for (const [app, metricKeys] of Object.entries(existingHeader?.apps || {})) {
        if (!appsManifest[app]) {
            appsManifest[app] = [];
        }
        for (const metricKey of metricKeys) {
            if (!appsManifest[app].includes(metricKey)) {
                appsManifest[app].push(metricKey);
            }
        }
    }

    const existingColumnIndex = new Map(
        (existingHeader?.columns || []).map((column, index) => [getColumnId(column), index]),
    );

    for (const app of Object.keys(appsManifest).sort()) {
        const metricKeys = new Set<string>([
            ...(appsManifest[app] || []),
            ...(metricMapKeys(grid.get(app))),
        ]);

        const writtenMetricKeys: string[] = [];
        for (const metricKey of [...metricKeys].sort()) {
            const dataFile = `${app}_${metricKey}.json`;
            const existingData = await readJsonIfExists<Record<string, (number | null)[]>>(
                join(dir, dataFile),
            );
            const data: Record<string, (number | null)[]> = {};

            let existingRowsKept = 0;
            let existingValuesCarried = 0;
            for (const [rowKey, values] of Object.entries(existingData || {})) {
                const merged = new Array(columns.length).fill(null) as (number | null)[];
                for (const [columnId, oldIndex] of existingColumnIndex) {
                    const newIndex = colIndex.get(columnId);
                    if (newIndex === undefined || oldIndex >= values.length) continue;
                    if (values[oldIndex] !== null && values[oldIndex] !== undefined) {
                        merged[newIndex] = values[oldIndex];
                        existingValuesCarried++;
                    }
                }
                if (merged.some(v => v !== null)) {
                    data[rowKey] = merged;
                    existingRowsKept++;
                }
            }

            const rowMap = grid.get(app)?.get(metricKey);
            let newRowsAdded = 0;
            let newValuesWritten = 0;
            let valuesOverwritten = 0;
            for (const [rowKey, values] of rowMap || []) {
                if (!data[rowKey]) {
                    data[rowKey] = new Array(columns.length).fill(null);
                    newRowsAdded++;
                }
                for (let index = 0; index < values.length; index++) {
                    if (values[index] !== null) {
                        if (data[rowKey][index] !== null) valuesOverwritten++;
                        data[rowKey][index] = values[index];
                        newValuesWritten++;
                    }
                }
            }

            if (ctx.verbose && existingData) {
                debug(`    ${dataFile}: ${existingRowsKept} existing rows (${existingValuesCarried} values), ${newRowsAdded} new rows, ${newValuesWritten} new values (${valuesOverwritten} overwrites)`);
            }

            if (Object.keys(data).length > 0) {
                await writeFile(join(dir, dataFile), JSON.stringify(data), 'utf-8');
                if (ctx.verbose) debug(`  wrote ${dataFile}`);
                writtenMetricKeys.push(metricKey);
            }
        }

        if (writtenMetricKeys.length > 0) {
            appsManifest[app] = writtenMetricKeys;
        } else {
            delete appsManifest[app];
        }
    }

    // Write header AFTER data files
    const header: ViewHeader = { columns, apps: sortAppsManifest(appsManifest) };
    if (type === 'week') header.week = label;
    else header.release = label;

    await writeFile(join(dir, 'header.json'), JSON.stringify(header, null, 2), 'utf-8');
    if (ctx.verbose) debug(`  wrote header.json`);

    if (ctx.verbose) {
        debug(`${type} ${label}: ${columns.length} cols, ${Object.keys(appsManifest).length} apps`);
    }
}

// ── View Index Builder ───────────────────────────────────────────────────────

function buildViewIndex(
    results: LoadedResult[],
    activeRelease: string,
    weeks: string[],
    releases: string[],
): ViewIndex {
    const apps = new Set<string>();
    const runtimes = new Set<string>();
    const presets = new Set<string>();
    const profiles = new Set<string>();
    const engines = new Set<string>();
    const appMetrics = new Map<string, Set<string>>();

    for (const r of results) {
        apps.add(r.app);
        const [runtime, preset, profile, engine] = r.rowKey.split('/');
        runtimes.add(runtime);
        presets.add(preset);
        profiles.add(profile);
        engines.add(engine);

        if (!appMetrics.has(r.app)) appMetrics.set(r.app, new Set());
        for (const key of Object.keys(r.metrics)) {
            appMetrics.get(r.app)!.add(key);
        }
    }

    const metrics: Record<string, string[]> = {};
    for (const [app, metricSet] of appMetrics) {
        metrics[app] = [...metricSet].sort();
    }

    return {
        lastUpdated: new Date().toISOString(),
        activeRelease,
        releases,
        weeks,
        apps: [...apps].sort(),
        metrics,
        dimensions: {
            runtimes: [...runtimes].sort(),
            presets: [...presets].sort(),
            profiles: [...profiles].sort(),
            engines: [...engines].sort(),
        },
    };
}

function mergeViewIndex(existing: ViewIndex | null, current: ViewIndex): ViewIndex {
    const mergedMetrics: Record<string, string[]> = {};
    for (const [app, metricKeys] of Object.entries(existing?.metrics || {})) {
        mergedMetrics[app] = [...metricKeys].sort();
    }
    for (const [app, metricKeys] of Object.entries(current.metrics || {})) {
        mergedMetrics[app] = [...new Set([...(mergedMetrics[app] || []), ...metricKeys])].sort();
    }

    return {
        lastUpdated: new Date().toISOString(),
        activeRelease: current.activeRelease || existing?.activeRelease || '',
        releases: [...new Set([...(existing?.releases || []), ...(current.releases || [])])].sort(compareNetLabel),
        weeks: [...new Set([...(existing?.weeks || []), ...(current.weeks || [])])].sort().reverse(),
        apps: [...new Set([...(existing?.apps || []), ...(current.apps || [])])].sort(),
        metrics: mergedMetrics,
        dimensions: {
            runtimes: [...new Set([
                ...(existing?.dimensions?.runtimes || []),
                ...(current.dimensions?.runtimes || []),
            ])].sort(),
            presets: [...new Set([
                ...(existing?.dimensions?.presets || []),
                ...(current.dimensions?.presets || []),
            ])].sort(),
            profiles: [...new Set([
                ...(existing?.dimensions?.profiles || []),
                ...(current.dimensions?.profiles || []),
            ])].sort(),
            engines: [...new Set([
                ...(existing?.dimensions?.engines || []),
                ...(current.dimensions?.engines || []),
            ])].sort(),
        },
    };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function readJsonIfExists<T>(path: string): Promise<T | null> {
    if (!existsSync(path)) return null;
    return JSON.parse(await readFile(path, 'utf-8')) as T;
}

function metricMapKeys(metricMap?: Map<string, Map<string, (number | null)[]>>): string[] {
    return metricMap ? [...metricMap.keys()] : [];
}

function sortAppsManifest(appsManifest: Record<string, string[]>): Record<string, string[]> {
    const sorted: Record<string, string[]> = {};
    for (const app of Object.keys(appsManifest).sort()) {
        sorted[app] = [...new Set(appsManifest[app])].sort();
    }
    return sorted;
}

function getWeekMonday(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00Z');
    const day = d.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setUTCDate(d.getUTCDate() - diff);
    return d.toISOString().slice(0, 10);
}

function compareNetLabel(a: string, b: string): number {
    return (parseInt(a.replace('net', ''), 10) || 0) - (parseInt(b.replace('net', ''), 10) || 0);
}

function compareSdkVersion(a: string, b: string): number {
    return compareVersions(a, b);
}
