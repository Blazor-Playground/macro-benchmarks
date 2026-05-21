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
import { type WalkthroughOpts } from './walkthrough-types.js';

// Minimal Playwright Page type surface
type PlaywrightPage = {
    goto(url: string, options?: { timeout?: number; waitUntil?: string }): Promise<unknown>;
    waitForSelector(selector: string, options?: { timeout?: number; state?: string }): Promise<unknown>;
    waitForFunction(fn: (() => boolean) | string, arg: unknown, options?: { timeout?: number }): Promise<unknown>;
    evaluate<T>(fn: (() => T) | ((arg: unknown) => T), arg?: unknown): Promise<T>;
    on(event: string, handler: (...args: unknown[]) => void): void;
    off(event: string, handler: (...args: unknown[]) => void): void;
};

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
        await resp.text();
    }

    let count = 0;
    const start = performance.now();
    while (performance.now() - start < benchMs) {
        const resp = await fetch(benchUrl);
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

    const resp = await fetch(benchUrl);
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
