/**
 * blazor-perf-bench.ts — Throughput benchmarks for the blazor-perf app.
 *
 * Counter Heavy: Triggers StateHasChanged loop rendering 5000 child components.
 *   Returns renders/sec measured by C# Stopwatch via JSInterop.
 *
 * VirtualScroll Heavy: Scrolls a Virtualize grid with 10k items.
 *   Returns renders/sec measured by C# Stopwatch via JSInterop.
 *
 * Interop benchmarks: Same as empty-blazor (JS↔CS calls), migrated here.
 */

import { debug } from '../log.js';
import { type WalkthroughOpts, type WalkthroughWithOtel } from './walkthrough-types.js';

// Minimal Playwright Page type surface
type PlaywrightPage = {
    goto(url: string, options?: { timeout?: number; waitUntil?: string }): Promise<unknown>;
    waitForSelector(selector: string, options?: { timeout?: number; state?: string }): Promise<unknown>;
    waitForFunction(fn: (() => boolean) | string, arg: unknown, options?: { timeout?: number }): Promise<unknown>;
    evaluate<T>(fn: (() => T) | ((arg: unknown) => T), arg?: unknown): Promise<T>;
    on(event: string, handler: (...args: unknown[]) => void): void;
    off(event: string, handler: (...args: unknown[]) => void): void;
};

// ── OTEL Server Metrics Helpers ──────────────────────────────────────────────

/** Counter keys we extract from the /api/bench/metrics snapshot. */
const OTEL_COUNTER_MAP: Record<string, string> = {
    'System.Runtime/gc-heap-size': 'heap-mb',
    'System.Runtime/gen-0-gc-count': 'gc-gen0',
    'System.Runtime/gen-1-gc-count': 'gc-gen1',
    'System.Runtime/gen-2-gc-count': 'gc-gen2',
    'System.Runtime/time-in-gc': 'gc-pause-pct',
    'System.Runtime/alloc-rate': 'alloc-rate',
    'System.Runtime/monitor-lock-contention-count': 'lock-contentions',
    'System.Runtime/threadpool-thread-count': 'threadpool-threads',
    'System.Runtime/threadpool-queue-length': 'threadpool-queue',
    'System.Runtime/cpu-usage': 'cpu-pct',
    'System.Runtime/working-set': 'working-set-mb',
};

type OtelSnapshot = Record<string, number>;

/**
 * Fetches the current OTEL EventCounter snapshot from the Kestrel host.
 * Returns a simplified map of counter names to values.
 */
async function fetchOtelSnapshot(baseUrl: string): Promise<OtelSnapshot> {
    try {
        const resp = await fetch(new URL('/api/bench/metrics', baseUrl).href);
        if (!resp.ok) return {};
        const raw = await resp.json() as Record<string, number>;
        const snapshot: OtelSnapshot = {};
        for (const [rawKey, shortKey] of Object.entries(OTEL_COUNTER_MAP)) {
            if (rawKey in raw) {
                snapshot[shortKey] = raw[rawKey];
            }
        }
        return snapshot;
    } catch {
        return {};
    }
}

/**
 * Compute deltas between two OTEL snapshots.
 * For cumulative counters (gc-gen0, lock-contentions, etc.) returns the difference.
 * For gauge counters (cpu-pct, gc-pause-pct, threadpool-threads) returns the "after" value.
 */
function computeOtelDeltas(before: OtelSnapshot, after: OtelSnapshot): Record<string, number> {
    const CUMULATIVE = new Set(['gc-gen0', 'gc-gen1', 'gc-gen2', 'lock-contentions']);
    const MB_KEYS = new Set(['heap-mb', 'working-set-mb']);
    const deltas: Record<string, number> = {};

    for (const key of Object.keys(after)) {
        const afterVal = after[key];
        const beforeVal = before[key] ?? 0;

        if (CUMULATIVE.has(key)) {
            deltas[key] = afterVal - beforeVal;
        } else if (MB_KEYS.has(key)) {
            // Convert bytes to MB for readability
            deltas[key] = Math.round(afterVal / (1024 * 1024) * 10) / 10;
        } else if (key === 'alloc-rate') {
            // alloc-rate is bytes/sec, convert to MB/sec
            deltas[key] = Math.round(afterVal / (1024 * 1024) * 10) / 10;
        } else {
            // Gauge: use the "after" value (represents state during/after the run)
            deltas[key] = Math.round(afterVal * 100) / 100;
        }
    }
    return deltas;
}

// ── Counter Heavy Benchmark ──────────────────────────────────────────────────

/**
 * Runs the Counter Heavy benchmark (WASM mode).
 * Navigates to /counter-heavy-wasm, triggers the C# measurement loop via JSInterop.
 * Returns renders/sec.
 */
export async function runCounterHeavyWasm(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runMeasuredBenchmark(opts, '/counter-heavy-wasm', 'Counter Heavy WASM');
}

/**
 * Runs the Counter Heavy benchmark (Server mode).
 * Navigates to /counter-heavy-server, triggers the C# measurement loop via JSInterop.
 * Returns renders/sec.
 */
export async function runCounterHeavyServer(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runMeasuredBenchmark(opts, '/counter-heavy-server', 'Counter Heavy Server');
}

// ── VirtualScroll Heavy Benchmark ────────────────────────────────────────────

/**
 * Runs the VirtualScroll Heavy benchmark (WASM mode).
 */
export async function runVirtualScrollHeavyWasm(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runMeasuredBenchmark(opts, '/virtualscroll-heavy-wasm', 'VirtualScroll Heavy WASM');
}

/**
 * Runs the VirtualScroll Heavy benchmark (Server mode).
 */
export async function runVirtualScrollHeavyServer(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runMeasuredBenchmark(opts, '/virtualscroll-heavy-server', 'VirtualScroll Heavy Server');
}

// ── Parameters Count Benchmark ───────────────────────────────────────────────

/**
 * Runs the Parameters Count benchmark (WASM mode).
 * 10,000 components × 10 string parameters — measures SetParametersAsync overhead.
 */
export async function runParamsCountWasm(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runMeasuredBenchmark(opts, '/params-count-wasm', 'Params Count WASM');
}

/**
 * Runs the Parameters Count benchmark (Server mode).
 */
export async function runParamsCountServer(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runMeasuredBenchmark(opts, '/params-count-server', 'Params Count Server');
}

// ── Too Many Components Benchmark ────────────────────────────────────────────

/**
 * Runs the Too Many Components benchmark (WASM mode).
 * 1,000 rows × 3 TableCells with child content — measures component tree diff overhead.
 */
export async function runTooManyComponentsWasm(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runMeasuredBenchmark(opts, '/too-many-components-wasm', 'Too Many Components WASM');
}

/**
 * Runs the Too Many Components benchmark (Server mode).
 */
export async function runTooManyComponentsServer(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runMeasuredBenchmark(opts, '/too-many-components-server', 'Too Many Components Server');
}

// ── Interop Benchmarks (migrated from empty-blazor) ──────────────────────────

async function runInteropBench(
    opts: WalkthroughOpts<PlaywrightPage>,
    fnName: string,
    label: string,
): Promise<number> {
    const { page: _page, url, timeout, verbose = false, durationMs = 60_000 } = opts;
    const page = _page!;
    const benchMs = Math.round(durationMs / 2);
    const weatherUrl = new URL('/weather', url).href;

    debug(`[blazor-perf:${label}] navigating to ${weatherUrl}`);
    await page.goto(weatherUrl, { timeout, waitUntil: 'load' });
    await page.waitForSelector('[data-testid="weather-scroll-container"]', { timeout });
    debug(`[blazor-perf:${label}] selector found, waiting for WASM module...`);

    // Wait for JS module to load (Weather.razor.js registers globals)
    // Use outer timeout — WASM boot + module import may exceed 10s under load
    await page.waitForFunction(
        `typeof globalThis['${fnName}'] === 'function'`,
        null,
        { timeout },
    );
    debug(`[blazor-perf:${label}] module loaded, globalThis.${fnName} available`);

    debug(`[blazor-perf:${label}] running benchmark for ${benchMs}ms`);
    const count = await page.evaluate(
        async (args: unknown) => {
            const { fnName: fn, benchMs: ms } = args as { fnName: string; benchMs: number };
            const benchFn = (globalThis as unknown as Record<string, (ms: number) => Promise<number>>)[fn];
            return await benchFn(ms);
        },
        { fnName, benchMs },
    );

    const opsPerSec = count * 1000 / benchMs;
    debug(`[blazor-perf:${label}] result: ${opsPerSec.toFixed(1)} ops/sec (${count} ops in ${benchMs}ms)`);
    return opsPerSec;
}

export async function runBlazorPerfJsToCsNumber(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runInteropBench(opts, 'benchJsToCsNumber', 'JS→CS Number');
}

export async function runBlazorPerfJsToCsString(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runInteropBench(opts, 'benchJsToCsString', 'JS→CS String');
}

export async function runBlazorPerfJsToCsJson(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runInteropBench(opts, 'benchJsToCsJson', 'JS→CS JSON');
}

export async function runBlazorPerfCsToJsNumber(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runInteropBench(opts, 'benchCsToJsNumber', 'CS→JS Number');
}

export async function runBlazorPerfCsToJsString(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runInteropBench(opts, 'benchCsToJsString', 'CS→JS String');
}

export async function runBlazorPerfCsToJsJson(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runInteropBench(opts, 'benchCsToJsJson', 'CS→JS JSON');
}

// ── SSR Benchmarks (HTTP-based timing, no browser needed) ────────────────────

/**
 * Runs the SSR benchmark for a given path by firing HTTP GETs in a loop and
 * measuring requests/sec. Each request triggers a full server-side render.
 */
async function runSsrBench(
    opts: WalkthroughOpts<PlaywrightPage>,
    path: string,
    label: string,
): Promise<number> {
    const { url, timeout, verbose = false, durationMs = 60_000 } = opts;
    const benchMs = Math.min(durationMs, 30_000);
    const benchUrl = new URL(path, url).href;

    debug(`[blazor-perf:${label}] measuring SSR renders/sec at ${benchUrl} for ${benchMs}ms`);

    // Warmup: 3 requests discarded
    for (let i = 0; i < 3; i++) {
        const resp = await fetch(benchUrl);
        if (!resp.ok) throw new Error(`[blazor-perf:${label}] warmup failed: HTTP ${resp.status}`);
        await resp.text();
    }

    let count = 0;
    const start = performance.now();
    while (performance.now() - start < benchMs) {
        const resp = await fetch(benchUrl);
        if (!resp.ok) throw new Error(`[blazor-perf:${label}] request failed: HTTP ${resp.status}`);
        await resp.text(); // consume body to ensure full render completes
        count++;
    }
    const elapsed = performance.now() - start;
    const opsPerSec = count * 1000 / elapsed;

    debug(`[blazor-perf:${label}] result: ${opsPerSec.toFixed(2)} renders/sec (${count} renders in ${Math.round(elapsed)}ms)`);
    return opsPerSec;
}

export async function runParamsCountSsr(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runSsrBench(opts, '/params-count-ssr', 'Params Count SSR');
}

export async function runTooManyComponentsSsr(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runSsrBench(opts, '/too-many-components-ssr', 'Too Many Components SSR');
}

// ── HtmlRenderer Benchmarks (in-process rendering via API endpoint) ──────────

/**
 * Calls the /api/bench/html-render endpoint which runs HtmlRenderer.RenderComponentAsync
 * in a loop in-process, returning renders/sec.
 */
async function runHtmlRendererBench(
    opts: WalkthroughOpts<PlaywrightPage>,
    scenario: string,
    label: string,
): Promise<number> {
    const { url, timeout, verbose = false, durationMs = 60_000 } = opts;
    const benchMs = Math.min(durationMs, 30_000);
    const benchUrl = new URL(`/api/bench/html-render?scenario=${encodeURIComponent(scenario)}&durationMs=${benchMs}`, url).href;

    debug(`[blazor-perf:${label}] calling HtmlRenderer endpoint for ${benchMs}ms`);

    const resp = await fetch(benchUrl, { signal: AbortSignal.timeout(benchMs + timeout) });
    if (!resp.ok) {
        throw new Error(`HtmlRenderer API returned ${resp.status}: ${await resp.text()}`);
    }
    const result = await resp.json() as { rendersPerSec: number; count: number; elapsedMs: number };

    debug(`[blazor-perf:${label}] result: ${result.rendersPerSec.toFixed(2)} renders/sec (${result.count} renders in ${result.elapsedMs}ms)`);
    return result.rendersPerSec;
}

export async function runParamsCountHtmlRenderer(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runHtmlRendererBench(opts, 'params-count', 'Params Count HtmlRenderer');
}

export async function runTooManyComponentsHtmlRenderer(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runHtmlRendererBench(opts, 'too-many-components', 'Too Many Components HtmlRenderer');
}

// ── SSR Stress Benchmarks (100 concurrent HTTP requests) ─────────────────────

/**
 * Fires N concurrent fetch() requests in parallel (via Promise.all), then
 * measures total requests completed per second across all concurrent streams.
 */
async function runSsrStressBench(
    opts: WalkthroughOpts<PlaywrightPage>,
    path: string,
    label: string,
    concurrency: number = 100,
): Promise<WalkthroughWithOtel> {
    const { url, timeout, verbose = false, durationMs = 60_000 } = opts;
    const benchMs = Math.min(durationMs, 30_000);
    const benchUrl = new URL(path, url).href;

    debug(`[blazor-perf:${label}] measuring SSR stress: ${concurrency} concurrent fetchers at ${benchUrl} for ${benchMs}ms`);

    // Warmup: 3 sequential requests to prime the server
    for (let i = 0; i < 3; i++) {
        const resp = await fetch(benchUrl);
        if (!resp.ok) throw new Error(`[blazor-perf:${label}] warmup failed: HTTP ${resp.status}`);
        await resp.text();
    }

    // Capture OTEL snapshot before stress
    const otelBefore = await fetchOtelSnapshot(url);

    // Launch N concurrent fetch loops, each running for benchMs duration
    let fetchErrors = 0;
    const results = await Promise.all(
        Array.from({ length: concurrency }, async () => {
            let count = 0;
            const start = performance.now();
            while (performance.now() - start < benchMs) {
                try {
                    const resp = await fetch(benchUrl);
                    if (!resp.ok) { fetchErrors++; break; }
                    await resp.text();
                    count++;
                } catch (e) {
                    fetchErrors++;
                    debug(`[blazor-perf:${label}] fetch error in worker: ${e}`);
                    break;
                }
            }
            return count;
        }),
    );
    if (fetchErrors > 0) {
        debug(`[blazor-perf:${label}] ${fetchErrors} workers encountered errors`);
    }

    // Capture OTEL snapshot after stress
    const otelAfter = await fetchOtelSnapshot(url);
    const otel = computeOtelDeltas(otelBefore, otelAfter);

    const totalCount = results.reduce((sum, c) => sum + c, 0);
    const opsPerSec = totalCount * 1000 / benchMs;

    debug(`[blazor-perf:${label}] result: ${opsPerSec.toFixed(2)} requests/sec (${totalCount} total across ${concurrency} workers in ${benchMs}ms)`);
    if (Object.keys(otel).length > 0) {
        debug(`[blazor-perf:${label}] OTEL: ${JSON.stringify(otel)}`);
    }
    return { value: opsPerSec, otel };
}

export async function runParamsCountSsrStress(opts: WalkthroughOpts<PlaywrightPage>): Promise<WalkthroughWithOtel> {
    return runSsrStressBench(opts, '/params-count-ssr', 'Params Count SSR ×100', 100);
}

export async function runTooManyComponentsSsrStress(opts: WalkthroughOpts<PlaywrightPage>): Promise<WalkthroughWithOtel> {
    return runSsrStressBench(opts, '/too-many-components-ssr', 'Too Many Components SSR ×100', 100);
}

// ── HtmlRenderer Stress Benchmarks (100 parallel in-process renders) ─────────

/**
 * Calls the /api/bench/html-render-stress endpoint which runs Task.WhenAll
 * of N parallel HtmlRenderer instances, returning aggregate renders/sec.
 */
async function runHtmlRendererStressBench(
    opts: WalkthroughOpts<PlaywrightPage>,
    scenario: string,
    label: string,
    parallel: number = 100,
): Promise<WalkthroughWithOtel> {
    const { url, timeout, verbose = false, durationMs = 60_000 } = opts;
    const benchMs = Math.min(durationMs, 30_000);
    const benchUrl = new URL(
        `/api/bench/html-render-stress?scenario=${encodeURIComponent(scenario)}&durationMs=${benchMs}&parallel=${parallel}`,
        url,
    ).href;

    debug(`[blazor-perf:${label}] calling HtmlRenderer stress endpoint (${parallel} parallel) for ${benchMs}ms`);

    // Capture OTEL snapshot before stress
    const otelBefore = await fetchOtelSnapshot(url);

    // Timeout must account for JIT warmup of parallel tasks on cold process
    const resp = await fetch(benchUrl, { signal: AbortSignal.timeout(benchMs + timeout) });
    if (!resp.ok) {
        throw new Error(`HtmlRenderer stress API returned ${resp.status}: ${await resp.text()}`);
    }
    const result = await resp.json() as { rendersPerSec: number; totalCount: number; parallel: number; maxElapsedMs: number };

    // Capture OTEL snapshot after stress
    const otelAfter = await fetchOtelSnapshot(url);
    const otel = computeOtelDeltas(otelBefore, otelAfter);

    debug(`[blazor-perf:${label}] result: ${result.rendersPerSec.toFixed(2)} renders/sec (${result.totalCount} total across ${result.parallel} tasks in ${result.maxElapsedMs}ms)`);
    if (Object.keys(otel).length > 0) {
        debug(`[blazor-perf:${label}] OTEL: ${JSON.stringify(otel)}`);
    }
    return { value: result.rendersPerSec, otel };
}

export async function runParamsCountHtmlRendererStress(opts: WalkthroughOpts<PlaywrightPage>): Promise<WalkthroughWithOtel> {
    return runHtmlRendererStressBench(opts, 'params-count', 'Params Count HtmlRenderer ×10', 10);
}

export async function runTooManyComponentsHtmlRendererStress(opts: WalkthroughOpts<PlaywrightPage>): Promise<WalkthroughWithOtel> {
    return runHtmlRendererStressBench(opts, 'too-many-components', 'Too Many Components HtmlRenderer ×10', 10);
}

// ── Interactive Server Stress Benchmarks (25 concurrent SignalR circuits) ─────

/**
 * Opens 25 iframes on a single Playwright page, each hosting a Blazor Server circuit.
 * Waits for all to become ready, then triggers benchmarks simultaneously via
 * direct iframe contentWindow access (same-origin). Reports aggregate renders/sec.
 */
async function runServerStressBench(
    opts: WalkthroughOpts<PlaywrightPage>,
    path: string,
    label: string,
    sessions: number = 25,
): Promise<WalkthroughWithOtel> {
    const { page: _page, url, timeout, verbose = false, durationMs = 60_000 } = opts;
    const page = _page!;
    const benchDurationMs = Math.min(durationMs, 30_000);
    const benchUrl = new URL(path, url).href;

    debug(`[blazor-perf:${label}] creating ${sessions} iframes at ${benchUrl}`);

    // Navigate to a lightweight page on the same origin to host iframes
    await page.goto(url, { timeout, waitUntil: 'load' });

    // Create iframes and wait for all Blazor circuits to boot
    const allReady = await page.evaluate(
        async (args: unknown) => {
            const { benchUrl, sessions, timeout } = args as { benchUrl: string; sessions: number; timeout: number };
            const container = document.createElement('div');
            document.body.appendChild(container);

            const iframes: HTMLIFrameElement[] = [];
            for (let i = 0; i < sessions; i++) {
                const iframe = document.createElement('iframe');
                iframe.src = benchUrl;
                iframe.style.width = '400px';
                iframe.style.height = '300px';
                container.appendChild(iframe);
                iframes.push(iframe);
            }

            // Poll until all iframes have blazorPerf.benchComponent registered
            const start = Date.now();
            while (Date.now() - start < timeout) {
                const ready = iframes.every(iframe => {
                    try {
                        const win = iframe.contentWindow as unknown as Record<string, unknown> | null;
                        const bp = win?.['blazorPerf'] as Record<string, unknown> | undefined;
                        return !!bp?.['benchComponent'];
                    } catch { return false; }
                });
                if (ready) return true;
                await new Promise(r => setTimeout(r, 500));
            }
            return false;
        },
        { benchUrl, sessions, timeout },
    );

    if (!allReady) {
        throw new Error(`[blazor-perf:${label}] Not all ${sessions} iframes became ready within timeout`);
    }

    debug(`[blazor-perf:${label}] all ${sessions} circuits ready, triggering simultaneous benchmark for ${benchDurationMs}ms`);

    // Capture OTEL snapshot before stress
    const otelBefore = await fetchOtelSnapshot(url);

    // Trigger all benchmarks simultaneously via Promise.all
    const totalOpsPerSec = await page.evaluate(
        async (args: unknown) => {
            const { sessions, benchDurationMs } = args as { sessions: number; benchDurationMs: number };
            const iframes = document.querySelectorAll('iframe');
            const promises = Array.from(iframes).slice(0, sessions).map(async (iframe) => {
                const win = iframe.contentWindow as unknown as Record<string, unknown>;
                const bp = win['blazorPerf'] as Record<string, unknown>;
                const component = bp['benchComponent'] as { invokeMethodAsync: (name: string, ...args: unknown[]) => Promise<number> };
                return await component.invokeMethodAsync('RunBenchmark', benchDurationMs);
            });
            const results = await Promise.all(promises);
            // Sum all renders/sec across all circuits
            return results.reduce((sum, r) => sum + r, 0);
        },
        { sessions, benchDurationMs },
    );

    // Capture OTEL snapshot after stress
    const otelAfter = await fetchOtelSnapshot(url);
    const otel = computeOtelDeltas(otelBefore, otelAfter);

    debug(`[blazor-perf:${label}] result: ${totalOpsPerSec.toFixed(2)} aggregate renders/sec across ${sessions} circuits`);
    if (Object.keys(otel).length > 0) {
        debug(`[blazor-perf:${label}] OTEL: ${JSON.stringify(otel)}`);
    }
    return { value: totalOpsPerSec, otel };
}

export async function runParamsCountServerStress(opts: WalkthroughOpts<PlaywrightPage>): Promise<WalkthroughWithOtel> {
    return runServerStressBench(opts, '/params-count-server', 'Params Count Server ×25', 25);
}

export async function runTooManyComponentsServerStress(opts: WalkthroughOpts<PlaywrightPage>): Promise<WalkthroughWithOtel> {
    return runServerStressBench(opts, '/too-many-components-server', 'Too Many Components Server ×25', 25);
}

// ── Shared Measured Benchmark Runner ─────────────────────────────────────────

/**
 * Navigates to a measured benchmark page and triggers the C# measurement loop.
 * The page must use MeasuredComponentBase which registers via blazorPerf.setBenchComponent.
 * Returns renders/sec.
 */
async function runMeasuredBenchmark(
    opts: WalkthroughOpts<PlaywrightPage>,
    path: string,
    label: string,
): Promise<number> {
    const { page: _page, url, timeout, verbose = false, durationMs = 60_000 } = opts;
    const page = _page!;
    const benchDurationMs = Math.min(durationMs, 30_000); // Cap at 30s per run
    const benchUrl = new URL(path, url).href;

    debug(`[blazor-perf:${label}] navigating to ${benchUrl}`);
    // Use 'load' instead of 'networkidle' — Blazor's SignalR WebSocket prevents networkidle
    await page.goto(benchUrl, { timeout, waitUntil: 'load' });
    debug(`[blazor-perf:${label}] page loaded, waiting for WASM boot + component registration...`);

    // Wait for the component to register itself via JSInterop
    // Debug builds with large unlinked assemblies can take >30s to boot WASM
    await page.waitForFunction(
        () => !!(globalThis as Record<string, unknown>)['blazorPerf']
            && !!((globalThis as Record<string, unknown>)['blazorPerf'] as Record<string, unknown>)['benchComponent'],
        null,
        { timeout },
    );

    debug(`[blazor-perf:${label}] component registered, running benchmark for ${benchDurationMs}ms`);

    // Invoke the C# RunBenchmark method via the registered DotNetObjectReference
    const opsPerSec = await page.evaluate(
        async (ms: unknown) => {
            const bp = (globalThis as Record<string, unknown>)['blazorPerf'] as Record<string, unknown>;
            const component = bp['benchComponent'] as { invokeMethodAsync: (name: string, ...args: unknown[]) => Promise<number> };
            return await component.invokeMethodAsync('RunBenchmark', ms as number);
        },
        benchDurationMs,
    );

    debug(`[blazor-perf:${label}] result: ${opsPerSec.toFixed(2)} renders/sec`);
    return opsPerSec;
}
