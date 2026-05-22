/**
 * blazor-bench.ts — Throughput benchmarks for the empty-blazor app.
 *
 * Two benchmarks run entirely inside the browser via page.evaluate():
 *
 * 1. Counter: clicks the increment button and waits for render in a tight
 *    loop for a fixed duration. Returns the number of click+render cycles.
 *
 * 2. Virtual Scroll: scrolls the Weather page's Virtualize grid up/down
 *    (page-down then page-up) and waits for render after each scroll.
 *    Returns the number of scroll+render cycles.
 *
 * Both use the onConsole hook (set up by empty-blazor's main.mjs) to
 * detect Blazor component render completion, with double-rAF settling.
 */

import { debug } from '../log.js';
import { type WalkthroughOpts } from './walkthrough-types.js';

// Minimal Playwright Page type surface used by these benchmarks
type PlaywrightPage = {
    goto(url: string, options?: { timeout?: number; waitUntil?: string }): Promise<unknown>;
    waitForSelector(selector: string, options?: { timeout?: number; state?: string }): Promise<unknown>;
    waitForFunction(fn: (() => boolean) | string, arg: unknown, options?: { timeout?: number }): Promise<unknown>;
    evaluate<T>(fn: (() => T) | ((arg: unknown) => T), arg?: unknown): Promise<T>;
    on(event: string, handler: (...args: unknown[]) => void): void;
    off(event: string, handler: (...args: unknown[]) => void): void;
};

// ── Counter Benchmark (in-browser) ──────────────────────────────────────────

const browserCounterBench = (args: unknown): Promise<number> => {
    const { timeout: t, durationMs, verbose } = args as { timeout: number; durationMs: number; verbose: boolean };

    const log = verbose
        ? (msg: string) => console.log(`[counter-bench] ${msg}`)
        : () => { /* noop */ };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onConsole = (globalThis as any).onConsole as ((...args: unknown[]) => void)[];
    let renderResolve: (() => void) | null = null;

    const renderHandler = (...logArgs: unknown[]): void => {
        const first = logArgs[0];
        if (typeof first === 'string' && first.startsWith('Counter component rendered.')) {
            if (renderResolve) {
                renderResolve();
                renderResolve = null;
            }
        }
    };
    onConsole.push(renderHandler);

    const waitForRender = (ms: number): Promise<void> =>
        new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                renderResolve = null;
                reject(new Error('Timed out waiting for counter render'));
            }, ms);
            renderResolve = () => {
                clearTimeout(timer);
                // Single-rAF: wait for browser to actually paint the DOM changes
                requestAnimationFrame(() => resolve());
            };
        });

    const click = (selector: string): void => {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) throw new Error(`click: element not found: ${selector}`);
        el.click();
    };

    const steps = async (): Promise<number> => {
        try {
            let count = 0;
            const deadline = performance.now() + durationMs;

            while (performance.now() < deadline) {
                const renderDone = waitForRender(t);
                click('[data-testid="counter-button"]');
                await renderDone;
                count++;
            }

            log(`completed ${count} counter clicks in ${durationMs}ms`);
            return count;
        } finally {
            const idx = onConsole.indexOf(renderHandler);
            if (idx >= 0) onConsole.splice(idx, 1);
        }
    };

    return steps();
};

// ── Exported Entry Points ───────────────────────────────────────────────────

/**
 * Navigates to the Counter page and clicks the increment button in a tight
 * loop for durationMs. Returns the number of click+render cycles per second.
 */
export async function runBlazorCounter(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    const { page, url, timeout, verbose = false, durationMs = 60_000 } = opts;
    const log = verbose ? (msg: string) => debug(`Counter: ${msg}`) : () => { };

    try {
        // Load home & wait for Blazor startup
        log('navigating to home...');
        await page.goto(url, { timeout, waitUntil: 'load' });
        await page.waitForFunction(
            () => (globalThis as Record<string, unknown>).bench_complete !== undefined,
            null, { timeout },
        );
        log('home loaded');

        // Navigate to counter page via nav link
        await page.evaluate(() => {
            const link = document.querySelector('[data-testid="nav-counter"]') as HTMLElement;
            if (!link) throw new Error('nav-counter link not found');
            link.click();
        });
        await page.waitForSelector('[data-testid="counter-button"]', { timeout });
        log('counter page loaded');

        // Inject __name helper for esbuild compatibility
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.evaluate(() => { (globalThis as any).__name = (fn: any) => fn; });

        // Run the timed benchmark loop inside the browser
        log(`starting counter bench (${durationMs}ms)...`);
        const count = await page.evaluate(browserCounterBench, { timeout, durationMs, verbose });

        const perSecond = count / (durationMs / 1_000);
        log(`counter bench completed: ${count} ops → ${perSecond.toFixed(1)}/sec`);
        return perSecond;
    } finally {
        // Navigate back to home for subsequent walkthroughs
        await page.goto(url, { timeout, waitUntil: 'load' }).catch(() => { /* ignore */ });
    }
}

// ── Interop Benchmarks ──────────────────────────────────────────────────────

/**
 * Helper: navigates to home, waits for Blazor startup, then navigates to
 * the Weather page (which loads Weather.razor.js and registers globalThis
 * bench functions).
 */
async function navigateToWeatherPage(
    page: PlaywrightPage, url: string, timeout: number, log: (msg: string) => void,
): Promise<void> {
    log('navigating to home...');
    await page.goto(url, { timeout, waitUntil: 'load' });
    await page.waitForFunction(
        () => (globalThis as Record<string, unknown>).bench_complete !== undefined,
        null, { timeout },
    );
    log('home loaded');

    await page.evaluate(() => {
        const link = document.querySelector('[data-testid="nav-weather"]') as HTMLElement;
        if (!link) throw new Error('nav-weather link not found');
        link.click();
    });
    await page.waitForSelector('[data-testid="weather-scroll-container"]', { timeout });
    log('weather page loaded');
}

/**
 * Helper: runs a named globalThis bench function for durationMs/2,
 * normalises the returned count to per-second.
 */
async function runInteropBench(
    opts: WalkthroughOpts<PlaywrightPage>,
    fnName: string,
    label: string,
): Promise<number> {
    const { page, url, timeout, verbose = false, durationMs = 60_000 } = opts;
    const benchMs = Math.round(durationMs / 2);
    const log = verbose ? (msg: string) => debug(`${label}: ${msg}`) : () => { };

    try {
        await navigateToWeatherPage(page, url, timeout, log);

        log(`starting ${label} (${benchMs}ms)...`);
        const count = await page.evaluate(
            (args: unknown) => {
                const { fnName: fn, ms } = args as { fnName: string; ms: number };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const benchFn = (globalThis as any)[fn] as (ms: number) => Promise<number>;
                if (!benchFn) throw new Error(`globalThis.${fn} not found`);
                return benchFn(ms);
            },
            { fnName, ms: benchMs },
        );

        const perSecond = count / (benchMs / 1_000);
        log(`${label} completed: ${count} ops in ${benchMs}ms → ${perSecond.toFixed(1)}/sec`);
        return perSecond;
    } finally {
        await page.goto(url, { timeout, waitUntil: 'load' }).catch(() => { /* ignore */ });
    }
}

/** JS→C# number interop: calls DotNet.invokeMethodAsync with number args for 30s. */
export async function runBlazorJsToCsNumber(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runInteropBench(opts, 'benchJsToCsNumber', 'JS→CS Number');
}

/** JS→C# string interop: calls DotNet.invokeMethodAsync with string arg for 30s. */
export async function runBlazorJsToCsString(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runInteropBench(opts, 'benchJsToCsString', 'JS→CS String');
}

/** JS→C# JSON interop: calls DotNet.invokeMethodAsync with JSON array for 30s. */
export async function runBlazorJsToCsJson(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runInteropBench(opts, 'benchJsToCsJson', 'JS→CS JSON');
}

/** C#→JS number interop: C# calls IJSRuntime.InvokeAsync with number args for 30s. */
export async function runBlazorCsToJsNumber(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runInteropBench(opts, 'benchCsToJsNumber', 'CS→JS Number');
}

/** C#→JS string interop: C# calls IJSRuntime.InvokeAsync with string arg for 30s. */
export async function runBlazorCsToJsString(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runInteropBench(opts, 'benchCsToJsString', 'CS→JS String');
}

/** C#→JS JSON interop: C# calls IJSRuntime.InvokeAsync with JSON array for 30s. */
export async function runBlazorCsToJsJson(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    return runInteropBench(opts, 'benchCsToJsJson', 'CS→JS JSON');
}
