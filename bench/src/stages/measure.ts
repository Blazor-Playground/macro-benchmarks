import { writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { type BenchContext, type BuildManifestEntry } from '../context.js';
import {
    type Engine, type Profile,
    App as A, Engine as E, Runtime as R,
    APP_CONFIG, BROWSER_ENGINES,
    MetricKey,
    getEnginesForApp, getProfilesForEngine,
    shouldSkipMeasurement,
    Preset,
    getRuntimesForApp,
} from '../enums.js';
import { isWindows } from '../exec.js';
import { banner, info, err, debug } from '../log.js';
import {
    type StaticServer,
    startStaticServer, measureFileSizes, verifyIntegrity,
    buildResultJson, buildResultFilename,
    findEntryFile,
} from '../lib/measure-utils.js';
import { PROFILES } from '../lib/throttle-profiles.js';
import { getEngineCommand, parseCliOutput } from '../lib/internal-utils.js';
import { runPizzaWalkthrough } from '../lib/pizza-walkthrough.js';
import { runHavitWalkthrough } from '../lib/havit-walkthrough.js';
import { runMudWalkthrough } from '../lib/mud-walkthrough.js';
import { runIgniteUIWalkthrough } from '../lib/igniteui-walkthrough.js';
import { runUnoWalkthrough } from '../lib/uno-walkthrough.js';
import { runSemiWalkthrough } from '../lib/semi-walkthrough.js';
import {
    runCounterHeavyWasm, runCounterHeavyServer,
    runParamsCountWasm, runParamsCountServer,
    runTooManyComponentsWasm, runTooManyComponentsServer,
    runBlazorPerfJsToCsNumber, runBlazorPerfJsToCsString, runBlazorPerfJsToCsJson,
    runBlazorPerfCsToJsNumber, runBlazorPerfCsToJsString, runBlazorPerfCsToJsJson,
    runParamsCountSsr, runTooManyComponentsSsr,
    runParamsCountHtmlRenderer, runTooManyComponentsHtmlRenderer,
    runParamsCountSsrStress, runTooManyComponentsSsrStress,
    runParamsCountHtmlRendererStress, runTooManyComponentsHtmlRendererStress,
    runParamsCountServerStress, runTooManyComponentsServerStress,
} from '../lib/blazor-perf-bench.js';
import { startKestrelServer, type KestrelServer } from '../lib/kestrel-launcher.js';
import { type WalkthroughOpts, type WalkthroughResult as WalkthroughFnReturn, hasOtel } from '../lib/walkthrough-types.js';
import { type SampleStats, computeStats, formatStats, sortedMedian, sortedIQM } from '../lib/stats.js';
import type { CDPSession, Page, BrowserContext, Browser } from 'playwright';

// ── Stage Entry Point ────────────────────────────────────────────────────────

export async function run(ctx: BenchContext): Promise<BenchContext> {
    if (!ctx.buildManifest?.length) throw new Error('measure stage requires ctx.buildManifest (run build first)');
    if (!ctx.sdkInfo) throw new Error('measure stage requires ctx.sdkInfo (run resolve-sdk first)');
    if (!ctx.resultsDir) throw new Error('measure stage requires ctx.resultsDir (run build first)');

    const effectiveEngines = ctx.dryRun ? [E.Chrome] : ctx.engines;
    const effectiveRuntimes = ctx.dryRun ? [R.Mono] : ctx.runtimes;
    const effectiveProfiles = ctx.dryRun ? ['desktop' as Profile] : ctx.profiles;
    const deadlineAt = ctx.deadlineMs > 0 ? Date.now() + ctx.deadlineMs : 0;
    let totalMeasurements = 0;
    let totalFailures = 0;

    if (ctx.verbose) {
        debug(`Engines: ${effectiveEngines.join(', ')}`);
        debug(`Runtimes: ${effectiveRuntimes.join(', ')}`);
        debug(`Profiles: ${effectiveProfiles.join(', ')}`);
        debug(`Apps: ${ctx.apps.join(', ')}`);
        debug(`Presets: ${ctx.presets.join(', ')}`);
        debug(`Build manifest entries: ${ctx.buildManifest.length}`);
        debug(`Dry run: ${ctx.dryRun}, headless: ${ctx.headless}, timeout: ${ctx.timeout}ms, retries: ${ctx.retries}`);
    }

    for (const entry of ctx.buildManifest) {
        // Apply app/preset filters
        if (!ctx.apps.includes(entry.app)) continue;
        if (!ctx.presets.includes(entry.preset)) continue;
        if (!ctx.runtimes.includes(entry.runtime)) continue;

        // Deadline check: stop scheduling new measurements if we're running out of time
        if (deadlineAt > 0 && Date.now() > deadlineAt) {
            err(`⚠ DEADLINE reached — skipping remaining measurements`);
            break;
        }

        const skipReason = shouldSkipMeasurement(entry.runtime, entry.app, entry.preset, ctx);
        if (skipReason) {
            info(`Skipping ${entry.app}/${entry.preset}: ${skipReason}`);
            continue;
        }

        banner(`Measure ${entry.app} / ${entry.preset}`);
        if (ctx.verbose) {
            debug(`publishDir: ${entry.publishDir}`);
            debug(`runtime: ${entry.runtime}, compileTimeMs: ${entry.compileTimeMs}`);
        }

        // Integrity verification
        const integrityCheck = await verifyIntegrity(entry.publishDir, entry.integrity);
        if (!integrityCheck.valid) {
            err(
                `Integrity mismatch for ${entry.app}/${entry.preset}: ` +
                `expected ${JSON.stringify(entry.integrity)}, ` +
                `got ${JSON.stringify(integrityCheck.actual)}`,
            );
            totalFailures++;
            continue;
        }

        const webRoot = join(entry.publishDir, 'wwwroot');
        const isInternal = APP_CONFIG[entry.app].internal;
        if (ctx.verbose) debug(`webRoot: ${webRoot}, isInternal: ${isInternal}`);

        // Measure file sizes (once per app×preset, shared across engines)
        const fileSizes = isInternal ? null : await measureFileSizes(webRoot, entry.preset !== Preset.DevLoop);
        if (ctx.verbose && fileSizes) {
            debug(`File sizes — native: ${fileSizes.diskSizeNative}, assemblies: ${fileSizes.diskSizeAssemblies}`);
        }
        const compileTime = entry.compileTimeMs;

        // Engine × profile loop
        const engines = getEnginesForApp(entry.app, effectiveEngines);
        const runtimes = getRuntimesForApp(entry.app, effectiveRuntimes);
        for (const runtime of runtimes) {
            for (const engine of engines) {
                const profiles = getProfilesForEngine(engine, effectiveProfiles);
                for (const profile of profiles) {
                    totalMeasurements++;
                    try {
                        info(`  ${engine}/${profile}`);

                        let result: MetricsResult;

                        if (BROWSER_ENGINES.has(engine)) {
                            result = await measureBrowser(
                                engine, profile, entry, webRoot,
                                compileTime, fileSizes, isInternal, ctx,
                                deadlineAt,
                            );
                        } else {
                            result = await measureCli(
                                engine, entry, webRoot,
                                compileTime, fileSizes, isInternal, ctx,
                            );
                        }

                        // Build and write result JSON
                        const meta = buildMeta(ctx, entry, engine, profile);
                        const resultJson = buildResultJson(meta, result.metrics, result.sampleCounts);
                        const filename = buildResultFilename(
                            ctx.sdkInfo, runtime, entry.preset,
                            profile, engine, entry.app,
                        );
                        const outPath = join(ctx.resultsDir, filename);
                        await writeFile(outPath, JSON.stringify(resultJson, null, 2) + '\n');
                        info(`    → ${filename}`);
                    } catch (e) {
                        totalFailures++;
                        err(`  Failed ${entry.app}/${entry.preset} ${engine}/${profile}: ${e instanceof Error ? e.message : e}`);
                    }
                }
            }
        }
    }

    banner(`Measurement complete: ${totalMeasurements - totalFailures}/${totalMeasurements} succeeded`);
    if (totalFailures > 0 && totalFailures === totalMeasurements) {
        throw new Error('All measurements failed');
    }

    return ctx;
}

// ── Meta Builder ─────────────────────────────────────────────────────────────

function buildMeta(
    ctx: BenchContext,
    entry: BuildManifestEntry,
    engine: Engine,
    profile: Profile,
): Record<string, unknown> {
    const meta: Record<string, unknown> = {
        ...ctx.sdkInfo,
        runtime: entry.runtime,
        preset: entry.preset,
        profile,
        engine,
        app: entry.app,
        benchmarkDateTime: new Date().toISOString(),
    };
    if (ctx.ciRunId) {
        meta.ciRunId = ctx.ciRunId;
        meta.ciRunUrl = `https://github.com/${ctx.repo}/actions/runs/${ctx.ciRunId}`;
    }
    return meta;
}

// ── Shared Types & Helpers ───────────────────────────────────────────────────

// (#4) Data-driven timing constructs — single source of truth for timing keys
const TIMING_KEYS = ['reachManaged', 'createDotnet', 'wasmMemory', 'exit'] as const;
type TimingKey = typeof TIMING_KEYS[number];
type BenchTimings = Record<TimingKey, number | null>;
type TimingArrays = Record<TimingKey, number[]>;

const TIMING_SOURCE: Record<TimingKey, string> = {
    reachManaged: 'time-to-reach-managed',
    createDotnet: 'time-to-create-dotnet',
    wasmMemory: 'wasm-memory-size',
    exit: 'time-to-exit',
};

function extractTimings(results: Record<string, number>): BenchTimings {
    const t = {} as BenchTimings;
    for (const k of TIMING_KEYS) t[k] = results[TIMING_SOURCE[k]] ?? null;
    return t;
}

function pushTiming(arrays: TimingArrays, t: BenchTimings): void {
    for (const key of TIMING_KEYS) {
        if (t[key] != null) arrays[key].push(t[key]);
    }
}

function emptyTimingArrays(): TimingArrays {
    const a = {} as TimingArrays;
    for (const k of TIMING_KEYS) a[k] = [];
    return a;
}

function mergeTimingArrays(target: TimingArrays, source: TimingArrays): void {
    for (const key of TIMING_KEYS) {
        target[key].push(...source[key]);
    }
}

// Walkthrough dispatch table — Chrome + desktop only
type WalkthroughFn = (opts: WalkthroughOpts<Page>) => Promise<WalkthroughFnReturn>;

const WALKTHROUGHS: { app: A; metric: MetricKey; fn: WalkthroughFn; runs?: number; selfNav?: boolean; noBrowser?: boolean; coreclrOnly?: boolean; wasmOnly?: boolean }[] = [
    { app: A.BlazingPizza, metric: MetricKey.PizzaWalkthrough, fn: runPizzaWalkthrough as WalkthroughFn },
    { app: A.HavitBootstrap, metric: MetricKey.HavitWalkthrough, fn: runHavitWalkthrough as WalkthroughFn },
    { app: A.MudBlazor, metric: MetricKey.MudWalkthrough, fn: runMudWalkthrough as WalkthroughFn },
    { app: A.IgniteUILight, metric: MetricKey.IgniteUIWalkthrough, fn: runIgniteUIWalkthrough as WalkthroughFn },
    { app: A.UnoGallery, metric: MetricKey.UnoWalkthrough, fn: runUnoWalkthrough as WalkthroughFn },
    // { app: A.SemiAvalonia, metric: MetricKey.SemiWalkthrough, fn: runSemiWalkthrough as WalkthroughFn },

    // blazor-perf: WASM-only benchmarks first (need healthy server for JS module imports)
    { app: A.BlazorPerf, metric: MetricKey.BlazorCounterHeavyWasm, fn: runCounterHeavyWasm as WalkthroughFn, runs: 1, selfNav: true, wasmOnly: true },
    { app: A.BlazorPerf, metric: MetricKey.BlazorParamsCountWasm, fn: runParamsCountWasm as WalkthroughFn, runs: 1, selfNav: true, wasmOnly: true },
    { app: A.BlazorPerf, metric: MetricKey.BlazorTooManyComponentsWasm, fn: runTooManyComponentsWasm as WalkthroughFn, runs: 1, selfNav: true, wasmOnly: true },
    { app: A.BlazorPerf, metric: MetricKey.BlazorJsToCsNumber, fn: runBlazorPerfJsToCsNumber as WalkthroughFn, runs: 1, selfNav: true, wasmOnly: true },
    { app: A.BlazorPerf, metric: MetricKey.BlazorJsToCsString, fn: runBlazorPerfJsToCsString as WalkthroughFn, runs: 1, selfNav: true, wasmOnly: true },
    { app: A.BlazorPerf, metric: MetricKey.BlazorJsToCsJson, fn: runBlazorPerfJsToCsJson as WalkthroughFn, runs: 1, selfNav: true, wasmOnly: true },
    { app: A.BlazorPerf, metric: MetricKey.BlazorCsToJsNumber, fn: runBlazorPerfCsToJsNumber as WalkthroughFn, runs: 1, selfNav: true, wasmOnly: true },
    { app: A.BlazorPerf, metric: MetricKey.BlazorCsToJsString, fn: runBlazorPerfCsToJsString as WalkthroughFn, runs: 1, selfNav: true, wasmOnly: true },
    { app: A.BlazorPerf, metric: MetricKey.BlazorCsToJsJson, fn: runBlazorPerfCsToJsJson as WalkthroughFn, runs: 1, selfNav: true, wasmOnly: true },

    // blazor-perf: Server-mode benchmarks LAST (SignalR circuits can starve Kestrel thread pool on close)
    // These run on the host CLR (always CoreCLR) regardless of WASM runtime setting
    { app: A.BlazorPerf, metric: MetricKey.BlazorCounterHeavyServer, fn: runCounterHeavyServer as WalkthroughFn, runs: 1, selfNav: true, coreclrOnly: true },
    { app: A.BlazorPerf, metric: MetricKey.BlazorParamsCountServer, fn: runParamsCountServer as WalkthroughFn, runs: 1, selfNav: true, coreclrOnly: true },
    { app: A.BlazorPerf, metric: MetricKey.BlazorTooManyComponentsServer, fn: runTooManyComponentsServer as WalkthroughFn, runs: 1, selfNav: true, coreclrOnly: true },

    // blazor-perf: SSR benchmarks (HTTP-only, no browser needed)
    // Server-side rendering always uses the host CLR (CoreCLR)
    { app: A.BlazorPerf, metric: MetricKey.BlazorParamsCountSsr, fn: runParamsCountSsr as WalkthroughFn, runs: 1, selfNav: true, noBrowser: true, coreclrOnly: true },
    { app: A.BlazorPerf, metric: MetricKey.BlazorTooManyComponentsSsr, fn: runTooManyComponentsSsr as WalkthroughFn, runs: 1, selfNav: true, noBrowser: true, coreclrOnly: true },

    // blazor-perf: HtmlRenderer benchmarks (in-process rendering via API, no browser needed)
    { app: A.BlazorPerf, metric: MetricKey.BlazorParamsCountHtmlRenderer, fn: runParamsCountHtmlRenderer as WalkthroughFn, runs: 1, selfNav: true, noBrowser: true, coreclrOnly: true },
    { app: A.BlazorPerf, metric: MetricKey.BlazorTooManyComponentsHtmlRenderer, fn: runTooManyComponentsHtmlRenderer as WalkthroughFn, runs: 1, selfNav: true, noBrowser: true, coreclrOnly: true },

    // blazor-perf: Stress benchmarks — SSR ×100 concurrent fetches (no browser needed)
    { app: A.BlazorPerf, metric: MetricKey.BlazorParamsCountSsrStress, fn: runParamsCountSsrStress as WalkthroughFn, runs: 1, selfNav: true, noBrowser: true, coreclrOnly: true },
    { app: A.BlazorPerf, metric: MetricKey.BlazorTooManyComponentsSsrStress, fn: runTooManyComponentsSsrStress as WalkthroughFn, runs: 1, selfNav: true, noBrowser: true, coreclrOnly: true },

    // blazor-perf: Stress benchmarks — HtmlRenderer ×10 parallel renders (no browser needed)
    { app: A.BlazorPerf, metric: MetricKey.BlazorParamsCountHtmlRendererStress, fn: runParamsCountHtmlRendererStress as WalkthroughFn, runs: 1, selfNav: true, noBrowser: true, coreclrOnly: true },
    { app: A.BlazorPerf, metric: MetricKey.BlazorTooManyComponentsHtmlRendererStress, fn: runTooManyComponentsHtmlRendererStress as WalkthroughFn, runs: 1, selfNav: true, noBrowser: true, coreclrOnly: true },

    // blazor-perf: Stress benchmarks — Interactive Server ×25 iframes (needs browser)
    { app: A.BlazorPerf, metric: MetricKey.BlazorParamsCountServerStress, fn: runParamsCountServerStress as WalkthroughFn, runs: 1, selfNav: true, coreclrOnly: true },
    { app: A.BlazorPerf, metric: MetricKey.BlazorTooManyComponentsServerStress, fn: runTooManyComponentsServerStress as WalkthroughFn, runs: 1, selfNav: true, coreclrOnly: true },
];

const INTERNAL_KEYS = ['js-interop-ops', 'json-parse-ops', 'exception-ops'] as const;

/** Metrics + sample counts for each metric key. */
interface MetricsResult {
    metrics: Partial<Record<MetricKey, number | null>>;
    sampleCounts: Partial<Record<MetricKey, number>>;
}

/** Average of the top-N largest values in an array (default N=3). */
function avgOfTopN(values: number[], n = 3): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => b - a);
    const top = sorted.slice(0, n);
    return top.reduce((a, b) => a + b, 0) / top.length;
}

// (#10) Logging separated from data assembly
function logInternalSummary(
    statsMap: Record<string, SampleStats>,
    timeToCreateDotnetCold: number | null,
    timeToExitCold: number | null,
    wasmMemorySize: number | null,
): void {
    info('    ═══ Benchmark Statistical Summary ═══');
    for (const [name, s] of Object.entries(statsMap)) {
        info(formatStats(name, s));
    }
    if (timeToCreateDotnetCold != null) info(`    time-to-create-dotnet-cold: ${Math.round(timeToCreateDotnetCold)} ms`);
    if (timeToExitCold != null) info(`    time-to-exit-cold: ${Math.round(timeToExitCold)} ms`);
    if (wasmMemorySize != null) info(`    wasm-memory-size: ${wasmMemorySize} bytes`);
}

function assembleInternalMetrics(
    statsMap: Record<string, SampleStats>,
    compileTime: number,
    memoryPeak: number | null,
    timeToCreateDotnetCold: number | null,
    timeToExitCold: number | null,
    wasmMemorySize: number | null,
): MetricsResult {
    return {
        metrics: {
            [MetricKey.CompileTime]: compileTime,
            [MetricKey.MemoryPeak]: memoryPeak,
            [MetricKey.TimeToCreateDotnetCold]: timeToCreateDotnetCold,
            [MetricKey.TimeToExitCold]: timeToExitCold,
            [MetricKey.WasmMemorySize]: wasmMemorySize,
            [MetricKey.JsInteropOps]: statsMap['js-interop-ops'] ? Math.round(statsMap['js-interop-ops'].median) : null,
            [MetricKey.JsonParseOps]: statsMap['json-parse-ops'] ? Math.round(statsMap['json-parse-ops'].median) : null,
            [MetricKey.ExceptionOps]: statsMap['exception-ops'] ? Math.round(statsMap['exception-ops'].median) : null,
        },
        sampleCounts: {
            [MetricKey.JsInteropOps]: statsMap['js-interop-ops']?.n,
            [MetricKey.JsonParseOps]: statsMap['json-parse-ops']?.n,
            [MetricKey.ExceptionOps]: statsMap['exception-ops']?.n,
        },
    };
}

function computeInternalStats(samples: Record<string, number[]>): Record<string, SampleStats> {
    const statsMap: Record<string, SampleStats> = {};
    for (const key of INTERNAL_KEYS) {
        if (samples[key]?.length > 0) {
            statsMap[key] = computeStats(samples[key]);
        }
    }
    return statsMap;
}

// (#11) Shared external metrics builder — used by both browser and CLI paths
function buildExternalMetrics(
    compileTime: number,
    fileSizes: { diskSizeNative: number; diskSizeAssemblies: number },
    coldArrays: TimingArrays,
    warmArrays: TimingArrays,
    wasmMemorySize: number | null,
    downloadSizeCold: number | null,
    downloadSizeWarm: number | null,
    serverRequestsCold: number | null,
    serverRequestsWarm: number | null,
    memoryPeak: number | null,
    walkthroughMetrics: Partial<Record<MetricKey, number | null>>,
    walkthroughSampleCounts: Partial<Record<MetricKey, number>>,
): MetricsResult {
    return {
        metrics: {
            [MetricKey.CompileTime]: compileTime,
            [MetricKey.DiskSizeNative]: fileSizes.diskSizeNative,
            [MetricKey.DiskSizeAssemblies]: fileSizes.diskSizeAssemblies,
            [MetricKey.DownloadSizeCold]: downloadSizeCold,
            [MetricKey.DownloadSizeWarm]: downloadSizeWarm,
            [MetricKey.ServerRequestsCold]: serverRequestsCold,
            [MetricKey.ServerRequestsWarm]: serverRequestsWarm,
            [MetricKey.TimeToReachManagedWarm]: sortedIQM(warmArrays.reachManaged),
            [MetricKey.TimeToReachManagedCold]: sortedIQM(coldArrays.reachManaged),
            [MetricKey.TimeToCreateDotnetWarm]: sortedIQM(warmArrays.createDotnet),
            [MetricKey.TimeToCreateDotnetCold]: sortedIQM(coldArrays.createDotnet),
            [MetricKey.TimeToExitWarm]: sortedIQM(warmArrays.exit),
            [MetricKey.TimeToExitCold]: sortedIQM(coldArrays.exit),
            [MetricKey.WasmMemorySize]: wasmMemorySize,
            [MetricKey.MemoryPeak]: memoryPeak,
            ...walkthroughMetrics,
        },
        sampleCounts: {
            [MetricKey.TimeToReachManagedWarm]: warmArrays.reachManaged.length || undefined,
            [MetricKey.TimeToReachManagedCold]: coldArrays.reachManaged.length || undefined,
            [MetricKey.TimeToCreateDotnetWarm]: warmArrays.createDotnet.length || undefined,
            [MetricKey.TimeToCreateDotnetCold]: coldArrays.createDotnet.length || undefined,
            [MetricKey.TimeToExitWarm]: warmArrays.exit.length || undefined,
            [MetricKey.TimeToExitCold]: coldArrays.exit.length || undefined,
            ...walkthroughSampleCounts,
        },
    };
}

// ── CDP Setup ────────────────────────────────────────────────────────────────

interface CDPState {
    client: CDPSession;
    downloadSizeTotal: number;
    memoryPeak: number;
    /** Returns the current accumulated download size and resets the counter to 0. */
    resetDownloadSize: () => number;
    stopMemorySampling: () => Promise<void>;
}

async function setupCDP(
    context: BrowserContext,
    page: Page,
    profile: Profile,
): Promise<CDPState> {
    const client = await context.newCDPSession(page);
    await client.send('Performance.enable');
    await client.send('Network.enable');

    let downloadSizeTotal = 0;
    let memoryPeak = 0;
    let memorySampling = true;

    client.on('Network.loadingFinished', (params: { encodedDataLength: number }) => {
        downloadSizeTotal += params.encodedDataLength;
    });

    const throttle = PROFILES[profile];
    if (throttle) {
        if (throttle.network) {
            await client.send('Network.emulateNetworkConditions', { ...throttle.network });
        }
        if (throttle.cpu) {
            await client.send('Emulation.setCPUThrottlingRate', { ...throttle.cpu });
        }
    }

    const memoryPoller = (async () => {
        while (memorySampling) {
            try {
                const perfMetrics = await client.send('Performance.getMetrics');
                const heapUsed = perfMetrics.metrics.find(
                    (m: { name: string; value: number }) => m.name === 'JSHeapUsedSize',
                );
                if (heapUsed && heapUsed.value > memoryPeak) {
                    memoryPeak = heapUsed.value;
                }
            } catch {
                break;
            }
            await sleep(100);
        }
    })();

    return {
        get downloadSizeTotal() { return downloadSizeTotal; },
        get memoryPeak() { return memoryPeak; },
        resetDownloadSize: () => {
            const v = downloadSizeTotal;
            downloadSizeTotal = 0;
            return v;
        },
        client,
        stopMemorySampling: async () => {
            await sleep(2000);
            memorySampling = false;
            await memoryPoller;
            await client.send('Performance.disable');
            await client.send('Network.disable');
        },
    };
}

// ── Page Load Helpers ────────────────────────────────────────────────────────

async function waitForBenchComplete(page: Page, timeout: number): Promise<Record<string, number>> {
    await page.waitForFunction(
        () => (globalThis as Record<string, unknown>).bench_complete !== undefined,
        null,
        { timeout },
    );
    return page.evaluate(
        () => (globalThis as Record<string, unknown>).bench_results as Record<string, number>,
    );
}

// (#1, #2) Removed unused `browser` parameter; CDP session is cleaned up when context closes
async function prepareColdContext(
    coldPage: Page,
    coldCtx: BrowserContext,
    pageUrl: string,
    profile: Profile,
    useCDP: boolean,
): Promise<void> {
    if (!useCDP) return;
    const coldClient = await coldCtx.newCDPSession(coldPage);

    // Clear browser-level HTTP cache and all origin storage (service workers,
    // indexedDB, localStorage, etc.) so each cold load starts fresh.
    await coldClient.send('Network.clearBrowserCache');
    const origin = new URL(pageUrl).origin;
    await coldClient.send('Storage.clearDataForOrigin', {
        origin,
        storageTypes: 'all',
    });

    const throttle = PROFILES[profile];
    if (throttle) {
        if (throttle.network) {
            await coldClient.send('Network.emulateNetworkConditions', { ...throttle.network });
        }
        if (throttle.cpu) {
            await coldClient.send('Emulation.setCPUThrottlingRate', { ...throttle.cpu });
        }
    }
}

async function runColdLoads(
    browser: Browser,
    pageUrl: string,
    warmRuns: number,
    timeout: number,
    profile: Profile,
    useCDP: boolean,
    verbose: boolean,
): Promise<TimingArrays> {
    const arrays = emptyTimingArrays();
    for (let i = 0; i < warmRuns; i++) {
        if (verbose) debug(`Cold load ${i + 1}/${warmRuns}: fresh context...`);
        const coldCtx = await browser.newContext();
        const coldPage = await coldCtx.newPage();
        try {
            await prepareColdContext(coldPage, coldCtx, pageUrl, profile, useCDP);
            await coldPage.goto(pageUrl, { timeout, waitUntil: 'load' });
            const results = await waitForBenchComplete(coldPage, timeout);
            const t = extractTimings(results);
            if (verbose) debug(`Cold load ${i + 1}/${warmRuns}: time-to-reach-managed=${t.reachManaged}`);
            pushTiming(arrays, t);
        } finally {
            await sleep(100);
            await coldPage.close();
            await coldCtx.close();
            await sleep(400);
        }
    }
    return arrays;
}

async function runWarmLoads(
    page: Page,
    warmRuns: number,
    timeout: number,
    verbose: boolean,
    cdp?: CDPState | null,
    srv?: StaticServer,
): Promise<{ timings: TimingArrays; downloadSizes: number[]; requestCounts: number[] }> {
    const arrays = emptyTimingArrays();
    const downloadSizes: number[] = [];
    const requestCounts: number[] = [];
    for (let i = 0; i < warmRuns; i++) {
        if (cdp) cdp.resetDownloadSize();
        if (srv) srv.resetRequestCount();
        if (verbose) debug(`Warm load ${i + 1}/${warmRuns}: reloading...`);
        await page.reload({ timeout, waitUntil: 'load' });
        if (verbose) debug(`Warm load ${i + 1}/${warmRuns}: waiting for bench_complete...`);
        const results = await waitForBenchComplete(page, timeout);
        const t = extractTimings(results);
        if (verbose) debug(`Warm load ${i + 1}/${warmRuns}: time-to-reach-managed=${t.reachManaged}`);
        pushTiming(arrays, t);
        if (cdp) downloadSizes.push(cdp.downloadSizeTotal);
        if (srv) requestCounts.push(srv.requestCount);
    }
    return { timings: arrays, downloadSizes, requestCounts };
}

// (#5) Simplified walkthrough filter — early return instead of loop-with-continue
interface WalkthroughResult {
    metrics: Partial<Record<MetricKey, number | null>>;
    sampleCounts: Partial<Record<MetricKey, number>>;
    jsHeapSamples: number[];
    wasmMemorySamples: number[];
}

async function runWalkthroughs(
    context: BrowserContext,
    launchBrowser: () => Promise<Browser>,
    pageUrl: string,
    entry: BuildManifestEntry,
    engine: Engine,
    profile: Profile,
    warmRuns: number,
    timeout: number,
    verbose: boolean,
    dryRun: boolean,
    cdp: CDPState | null,
    deadlineAt: number,
    restartServer: (() => Promise<string>) | null,
    sdkMajor: number,
): Promise<WalkthroughResult> {
    const empty: WalkthroughResult = { metrics: {}, sampleCounts: {}, jsHeapSamples: [], wasmMemorySamples: [] };
    const defaultRuns = warmRuns > 1 ? warmRuns * 4 : 1;
    // Walkthroughs are Chrome-only + desktop-only (CDP required for reliable timing)
    if (profile !== 'desktop' || engine !== E.Chrome) return empty;
    // Filter: coreclrOnly needs coreclr runtime; wasmOnly needs coreclr WASM support (SDK >= 11)
    const hasCoreclrWasm = entry.runtime === R.CoreCLR && sdkMajor >= 11;
    const matches = WALKTHROUGHS.filter(w =>
        w.app === entry.app
        && (!w.coreclrOnly || entry.runtime === R.CoreCLR)
        && (!w.wasmOnly || entry.runtime !== R.CoreCLR || hasCoreclrWasm)
    );
    if (matches.length === 0) return empty;

    const durationMs = dryRun ? 5_000 : 60_000;
    const allMetrics: Partial<Record<MetricKey, number | null>> = {};
    const allSampleCounts: Partial<Record<MetricKey, number>> = {};
    const jsHeapSamples: number[] = [];
    const wasmMemorySamples: number[] = [];
    let currentUrl = pageUrl;

    for (const wt of matches) {
        const runs = wt.runs ?? defaultRuns;
        const times: number[] = [];
        let maxIterationMs = 0;
        for (let i = 0; i < runs; i++) {
            // Time-budget guard: if remaining time < 2× longest iteration, stop early
            if (deadlineAt > 0 && i > 0) {
                const remainingMs = deadlineAt - Date.now();
                const safetyMargin = maxIterationMs * 2;
                if (remainingMs < safetyMargin) {
                    err(`⚠ DEADLINE: ${wt.metric} stopped after ${i}/${runs} runs — ` +
                        `remaining ${Math.round(remainingMs / 1000)}s < 2× max iteration ${Math.round(maxIterationMs / 1000)}s`);
                    break;
                }
            }
            const iterStart = performance.now();
            // selfNav walkthroughs get a fresh browser + server to provide full isolation
            let wtBrowser: Browser | null = null;
            let wtCtx: BrowserContext | null = null;
            let wtPage: Page | null = null;
            if (wt.selfNav) {
                // Restart Kestrel to avoid server-side state accumulation
                // (SignalR/circuit/thread-pool exhaustion after multiple WASM boots)
                if (restartServer) {
                    currentUrl = await restartServer();
                }
                if (!wt.noBrowser) {
                    wtBrowser = await launchBrowser();
                    wtCtx = await wtBrowser.newContext();
                    wtPage = await wtCtx.newPage();
                }
            } else {
                wtCtx = context;
                wtPage = await wtCtx.newPage();
                await wtPage.goto(currentUrl, { timeout, waitUntil: 'load' });
                await waitForBenchComplete(wtPage, timeout);
            }
            try {
                if (verbose) debug(`${wt.metric} ${i + 1}/${runs}...`);
                const rawResult = await wt.fn({ page: wtPage, url: currentUrl, timeout, verbose, durationMs });
                const t = hasOtel(rawResult) ? rawResult.value : rawResult;
                times.push(t);
                if (verbose) debug(`${wt.metric} ${i + 1}/${runs}: ${t}`);

                // Collect OTEL server-side metrics from stress benchmarks
                if (hasOtel(rawResult)) {
                    for (const [otelKey, otelVal] of Object.entries(rawResult.otel)) {
                        const derivedKey = `${wt.metric}-otel-${otelKey}` as MetricKey;
                        // For OTEL metrics, store the latest value (stress runs only once)
                        allMetrics[derivedKey] = Math.round(otelVal * 100) / 100;
                    }
                }

                // Sample JS heap and WASM linear memory after each walkthrough run
                if (cdp && wtPage) {
                    try {
                        const perfMetrics = await cdp.client.send('Performance.getMetrics');
                        const heapUsed = perfMetrics.metrics.find(
                            (m: { name: string; value: number }) => m.name === 'JSHeapUsedSize',
                        );
                        if (heapUsed) jsHeapSamples.push(heapUsed.value);
                    } catch { /* ignore */ }
                }
                if (wtPage) {
                    try {
                        const wasmBytes = await wtPage.evaluate(
                            () => (globalThis as any).getDotnetRuntime(0)?.Module?.HEAPU8?.byteLength ?? null,
                        );
                        if (wasmBytes != null) wasmMemorySamples.push(wasmBytes);
                    } catch { /* ignore */ }
                }
            } finally {
                if (wtPage) await wtPage.close();
                if (wt.selfNav) {
                    if (wtCtx) await wtCtx.close();
                    if (wtBrowser) await wtBrowser.close();
                }
                await sleep(200);
                const iterMs = performance.now() - iterStart;
                if (iterMs > maxIterationMs) maxIterationMs = iterMs;
            }
        }
        if (times.length < runs) {
            err(`⚠ PARTIAL RESULT: ${wt.metric} completed ${times.length}/${runs} runs (deadline reached)`);
        }
        const iqm = sortedIQM(times);
        const rounded = iqm != null ? Math.round(iqm) : null;
        if (verbose) {
            debug(`${wt.metric} values: [${times.join(', ')}] → iqm=${rounded}`);
        }
        allMetrics[wt.metric] = rounded;
        allSampleCounts[wt.metric] = times.length;
    }

    if (verbose) {
        if (jsHeapSamples.length > 0) debug(`Post-walkthrough JS heap samples: [${jsHeapSamples.join(', ')}] → avgTop3=${avgOfTopN(jsHeapSamples)}`);
        if (wasmMemorySamples.length > 0) debug(`Post-walkthrough WASM memory samples: [${wasmMemorySamples.join(', ')}] → avgTop3=${avgOfTopN(wasmMemorySamples)}`);
    }
    return {
        metrics: allMetrics,
        sampleCounts: allSampleCounts,
        jsHeapSamples,
        wasmMemorySamples,
    };
}

// ── Browser Session ──────────────────────────────────────────────────────────

// (#9) Extracted from measureBrowser — handles a single browser session
async function runBrowserSession(
    browser: Browser,
    launchBrowser: () => Promise<Browser>,
    pageUrl: string,
    entry: BuildManifestEntry,
    engine: Engine,
    profile: Profile,
    compileTime: number,
    fileSizes: { diskSizeNative: number; diskSizeAssemblies: number } | null,
    isInternal: boolean,
    useCDP: boolean,
    warmRuns: number,
    timeout: number,
    verbose: boolean,
    dryRun: boolean,
    srv: StaticServer | null,
    deadlineAt: number,
    restartServer: (() => Promise<string>) | null,
    sdkMajor: number,
): Promise<MetricsResult> {
    const context = await browser.newContext();
    const page = await context.newPage();

    // (#3) Use project logger instead of console.error
    page.on('console', (msg) => {
        if (msg.type() === 'error') err(`    [page] ${msg.text()}`);
    });
    page.on('pageerror', (error) => {
        if (error.message.includes('Arg_NullReferenceException')) return;
        err(`    [page error] ${error.message}`);
    });

    let cdp: CDPState | null = null;
    if (useCDP) {
        cdp = await setupCDP(context, page, profile);
    }

    // Cold load (first one uses the main context)
    if (srv) srv.resetRequestCount();
    if (verbose) debug(`Cold load: navigating to ${pageUrl}`);
    await page.goto(pageUrl, { timeout, waitUntil: 'load' });
    if (verbose) debug(`Cold load: page loaded, waiting for bench_complete...`);
    const coldResults = await waitForBenchComplete(page, timeout);
    const firstCold = extractTimings(coldResults);
    if (verbose) debug(`Cold results: ${JSON.stringify(coldResults)}`);

    // Snapshot cold download size and request count (single load, not accumulated)
    const coldDownloadSize = cdp ? cdp.resetDownloadSize() : null;
    const coldRequestCount = srv ? srv.resetRequestCount() : 0;
    if (verbose) {
        if (coldDownloadSize != null) debug(`Cold download size: ${coldDownloadSize} bytes`);
        debug(`Cold server requests: ${coldRequestCount}`);
    }

    const coldArrays = emptyTimingArrays();
    pushTiming(coldArrays, firstCold);

    // Additional cold loads + warm loads (external apps only)
    if (!isInternal) {
        if (warmRuns > 1) {
            const extraCold = await runColdLoads(
                browser, pageUrl, warmRuns - 1, timeout, profile, useCDP, verbose,
            );
            mergeTimingArrays(coldArrays, extraCold);
        }
        if (verbose && coldArrays.reachManaged.length > 1) {
            debug(`Cold times: [${coldArrays.reachManaged.join(', ')}] → iqm=${sortedIQM(coldArrays.reachManaged)}`);
        }
    }

    const warmResult = !isInternal
        ? await runWarmLoads(page, warmRuns, timeout, verbose, cdp, srv ?? undefined)
        : { timings: emptyTimingArrays(), downloadSizes: [] as number[], requestCounts: [] as number[] };
    const warmArrays = warmResult.timings;

    if (verbose && warmArrays.reachManaged.length > 1) {
        debug(`Warm times: [${warmArrays.reachManaged.join(', ')}] → iqm=${sortedIQM(warmArrays.reachManaged)}`);
    }
    const warmDownloadSize = warmResult.downloadSizes.length > 0
        ? sortedMedian(warmResult.downloadSizes)
        : null;
    if (verbose && warmDownloadSize != null) debug(`Warm download size (median): ${warmDownloadSize} bytes`);
    const warmRequestCount = warmResult.requestCounts.length > 0
        ? sortedMedian(warmResult.requestCounts)
        : null;
    if (verbose && warmRequestCount != null) debug(`Warm server requests (median): ${warmRequestCount}`);

    // (#8) Simplified wasmMemorySize computation
    const allWasmMem = coldArrays.wasmMemory.concat(warmArrays.wasmMemory);
    const wasmMemorySize = allWasmMem.length > 0 ? Math.max(...allWasmMem) : null;

    // For external apps, close the main browser before walkthroughs since selfNav
    // walkthroughs each get their own fresh browser + Kestrel instance.
    const appWalkthroughs = WALKTHROUGHS.filter(w => w.app === entry.app);
    const allSelfNav = appWalkthroughs.length > 0 && appWalkthroughs.every(w => w.selfNav);
    if (!isInternal && allSelfNav) {
        if (cdp) await cdp.stopMemorySampling();
        await sleep(100);
        await page.close();
        await context.close();
        await browser.close();
        await sleep(400);
    }

    // Walkthroughs (external apps only)
    const walkthroughResult = !isInternal
        ? await runWalkthroughs(context, launchBrowser, pageUrl, entry, engine, profile, warmRuns, timeout, verbose, dryRun, allSelfNav ? null : cdp, deadlineAt, restartServer, sdkMajor)
        : { metrics: {}, sampleCounts: {}, jsHeapSamples: [] as number[], wasmMemorySamples: [] as number[] };
    const walkthroughMetrics = walkthroughResult.metrics;
    const walkthroughSampleCounts = walkthroughResult.sampleCounts;

    // Replace memory metrics with post-walkthrough avg-of-top-3 when walkthrough ran
    if (walkthroughResult.jsHeapSamples.length > 0) {
        const v = avgOfTopN(walkthroughResult.jsHeapSamples);
        if (v != null && verbose) debug(`memory-peak (post-walkthrough avgTop3): ${Math.round(v)} bytes`);
    }
    if (walkthroughResult.wasmMemorySamples.length > 0) {
        const v = avgOfTopN(walkthroughResult.wasmMemorySamples);
        if (v != null && verbose) debug(`wasm-memory-size (post-walkthrough avgTop3): ${Math.round(v)} bytes`);
    }

    // Discard any download accumulation from walkthroughs
    if (cdp) cdp.resetDownloadSize();

    // Collect internal benchmark samples before closing the page
    let benchSamples: Record<string, number[]> | null = null;
    if (isInternal) {
        benchSamples = await page.evaluate(
            () => (globalThis as Record<string, unknown>).bench_samples as Record<string, number[]>,
        );
    }

    // Stop memory sampling + settle (only if not already closed above)
    if (!allSelfNav || isInternal) {
        if (cdp) {
            await cdp.stopMemorySampling();
        }

        if (verbose) debug(`Closing browser context...`);
        await sleep(100);
        await page.close();
        await context.close();
        await sleep(400);
        if (verbose) debug(`Cleanup complete`);
    }

    // Assemble metrics
    if (isInternal) {
        const statsMap = computeInternalStats(benchSamples!);
        const createDotnetCold = sortedIQM(coldArrays.createDotnet);
        const exitCold = sortedIQM(coldArrays.exit);
        logInternalSummary(statsMap, createDotnetCold, exitCold, wasmMemorySize);
        return assembleInternalMetrics(
            statsMap, compileTime,
            useCDP ? (cdp!.memoryPeak || null) : null,
            createDotnetCold, exitCold, wasmMemorySize,
        );
    }

    // Use post-walkthrough memory values (avg of top 3) when available,
    // otherwise fall back to load-phase values.
    const finalMemoryPeak = walkthroughResult.jsHeapSamples.length > 0
        ? (avgOfTopN(walkthroughResult.jsHeapSamples) ?? null)
        : useCDP ? (cdp!.memoryPeak || null) : null;
    const finalWasmMemorySize = walkthroughResult.wasmMemorySamples.length > 0
        ? (avgOfTopN(walkthroughResult.wasmMemorySamples) ?? null)
        : wasmMemorySize;

    return buildExternalMetrics(
        compileTime, fileSizes!,
        coldArrays, warmArrays,
        finalWasmMemorySize != null ? Math.round(finalWasmMemorySize) : null,
        useCDP ? (coldDownloadSize || null) : null,
        useCDP ? (warmDownloadSize || null) : null,
        coldRequestCount || null,
        warmRequestCount,
        finalMemoryPeak != null ? Math.round(finalMemoryPeak) : null,
        walkthroughMetrics,
        walkthroughSampleCounts,
    );
}

// ── Browser Measurement ──────────────────────────────────────────────────────

// (#9) measureBrowser now handles only retry loop + server lifecycle
async function measureBrowser(
    engine: Engine,
    profile: Profile,
    entry: BuildManifestEntry,
    webRoot: string,
    compileTime: number,
    fileSizes: { diskSizeNative: number; diskSizeAssemblies: number } | null,
    isInternal: boolean,
    ctx: BenchContext,
    deadlineAt: number,
): Promise<MetricsResult> {
    const pw = await import('playwright');
    const browserType = engine === E.Firefox ? pw.firefox : pw.chromium;
    const useCDP = engine !== E.Firefox;
    const warmRuns = ctx.dryRun ? 1
        : entry.preset === Preset.DevLoop ? 1
            : ctx.warmRuns;
    const timeout = ctx.timeout;
    const maxRetries = ctx.retries;

    const isKestrelHosted = APP_CONFIG[entry.app].kestrelHosted;
    let srv: StaticServer | null = null;
    let kestrel: KestrelServer | null = null;
    let pageUrl: string;

    if (isKestrelHosted) {
        kestrel = await startKestrelServer(entry.publishDir, ctx.dotnetBin);
        pageUrl = kestrel.url + '/';
    } else {
        srv = await startStaticServer(webRoot);
        pageUrl = `http://127.0.0.1:${srv.port}/`;
    }
    info(`    Serving on ${pageUrl}`);
    if (ctx.verbose) {
        debug(`Browser: ${engine}, CDP: ${useCDP}, warmRuns: ${warmRuns}, timeout: ${timeout}ms, retries: ${maxRetries}, kestrelHosted: ${!!isKestrelHosted}`);
    }

    // For Kestrel-hosted apps, provide a function that restarts the server between walkthroughs
    // to avoid Kestrel/Blazor state accumulation that hangs subsequent WASM boots.
    const restartServer: (() => Promise<string>) | null = isKestrelHosted ? async () => {
        if (kestrel) {
            await kestrel.close();
            kestrel = null;
        }
        kestrel = await startKestrelServer(entry.publishDir, ctx.dotnetBin);
        pageUrl = kestrel.url + '/';
        if (ctx.verbose) debug(`Kestrel restarted on ${pageUrl}`);
        return pageUrl;
    } : null;

    let lastError: Error | null = null;

    try {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            if (attempt > 0) info(`    Retry ${attempt}/${maxRetries}...`);

            if (ctx.verbose) debug(`Launching browser (headless=${ctx.headless})...`);
            const isChromium = engine !== E.Firefox;
            const launchArgs = isChromium && ctx.headless ? [
                '--enable-unsafe-swiftshader',
                '--use-gl=angle',
                '--use-angle=swiftshader',
                '--disable-gpu-vsync',
                '--disable-frame-rate-limit',
                '--enable-webgl',
                '--ignore-gpu-blocklist',
                '--no-sandbox',
                '--disable-dev-shm-usage',
            ] : undefined;
            const launchBrowser = () => browserType.launch({
                headless: ctx.headless,
                args: launchArgs,
            });
            const browser = await launchBrowser();
            try {
                const result = await runBrowserSession(
                    browser, launchBrowser, pageUrl, entry, engine, profile,
                    compileTime, fileSizes, isInternal, useCDP,
                    warmRuns, timeout, ctx.verbose, ctx.dryRun, srv,
                    deadlineAt, restartServer, ctx.sdkInfo.major,
                );
                await sleep(100);
                try { await browser.close(); } catch { /* already closed for allSelfNav */ }
                await sleep(400);
                return result;
            } catch (e) {
                lastError = e instanceof Error ? e : new Error(String(e));
                try {
                    await browser.close();
                    await sleep(500);
                } catch { /* ignore */ }
                if (attempt >= maxRetries) throw lastError;
                info(`    Attempt ${attempt + 1} failed: ${lastError.message}`);
            }
        }

        throw lastError ?? new Error('All attempts failed');
    } finally {
        if (srv) await srv.close();
        if (kestrel) await kestrel.close();
    }
}

// ── CLI Measurement ──────────────────────────────────────────────────────────

async function measureCli(
    engine: Engine,
    entry: BuildManifestEntry,
    webRoot: string,
    compileTime: number,
    fileSizes: { diskSizeNative: number; diskSizeAssemblies: number } | null,
    isInternal: boolean,
    ctx: BenchContext,
): Promise<MetricsResult> {
    const { cmd, args: engineArgs } = getEngineCommand(engine);
    const entryFile = await findEntryFile(webRoot);

    info(`    Running: ${cmd} ${engineArgs.join(' ')} ${entryFile}`);
    info(`    cwd: ${webRoot}`);

    const useShell = isWindows() && /\.(cmd|bat)$/i.test(cmd);

    // (#7) Removed redundant env spread — process.env is inherited by default
    const startTime = performance.now();
    const stdout = execFileSync(cmd, [...engineArgs, entryFile], {
        encoding: 'utf-8',
        cwd: webRoot,
        timeout: ctx.timeout,
        ...(useShell && { shell: true }),
    });
    const wallTimeMs = performance.now() - startTime;

    const cliParsed = parseCliOutput(stdout);

    if (isInternal) {
        const { results: cliInternalResults, samples: cliSamples } = cliParsed as { results: Record<string, number>; samples: Record<string, number[]> };
        const t = extractTimings(cliInternalResults);

        const statsMap = computeInternalStats(cliSamples);

        for (const key of INTERNAL_KEYS) {
            if (!statsMap[key]) {
                throw new Error(`No samples found for '${key}' in CLI output. Output:\n${stdout}`);
            }
        }

        logInternalSummary(statsMap, t.createDotnet, t.exit, t.wasmMemory);
        return assembleInternalMetrics(
            statsMap, compileTime, null,
            t.createDotnet, t.exit, t.wasmMemory,
        );
    }

    // (#6, #11) External CLI: use shared builder, no dead null walkthrough keys
    const cliResults = cliParsed as Record<string, number>;
    const t = extractTimings(cliResults);
    // Wall-clock fallback for reach-managed
    if (t.reachManaged == null) t.reachManaged = wallTimeMs;

    const cliArrays = emptyTimingArrays();
    pushTiming(cliArrays, t);

    return buildExternalMetrics(
        compileTime, fileSizes!,
        cliArrays, cliArrays, t.wasmMemory,
        null, null, null, null, null, {}, {},
    );
}
