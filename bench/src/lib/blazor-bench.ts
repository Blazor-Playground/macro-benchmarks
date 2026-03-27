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

// ── Virtual Scroll Benchmark (in-browser) ───────────────────────────────────

const browserVirtualScrollBench = (args: unknown): Promise<number> => {
    const { timeout: t, durationMs, verbose } = args as { timeout: number; durationMs: number; verbose: boolean };

    const log = verbose
        ? (msg: string) => console.log(`[vscroll-bench] ${msg}`)
        : () => { /* noop */ };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onConsole = (globalThis as any).onConsole as ((...args: unknown[]) => void)[];
    let renderResolve: (() => void) | null = null;

    // Virtualize fires LoadForecasts (async) then OnAfterRender.
    // Listen for the data-load message which fires reliably on scroll.
    const renderHandler = (...logArgs: unknown[]): void => {
        const first = logArgs[0];
        if (typeof first === 'string' && first.startsWith('Virtual scroll loaded items')) {
            if (renderResolve) {
                renderResolve();
                renderResolve = null;
            }
        }
    };
    onConsole.push(renderHandler);

    const waitForScrollRender = (container: HTMLElement, ms: number): Promise<void> =>
        new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                renderResolve = null;
                container.removeEventListener('scrollend', scrollHandler);
                reject(new Error('Timed out waiting for virtual scroll render'));
            }, ms);

            // Primary: Virtualize loads new items → console message
            renderResolve = () => {
                clearTimeout(timer);
                container.removeEventListener('scrollend', scrollHandler);
                resolve();
            };

            // Fallback: if scroll doesn't cross a Virtualize boundary,
            // no LoadForecasts fires. Settle on scrollend instead.
            function scrollHandler() {
                // Give Virtualize a frame to decide if it needs new data
                requestAnimationFrame(() => {
                    if (renderResolve) {
                        // Still waiting — no data load happened, settle now
                        renderResolve();
                        renderResolve = null;
                    }
                });
            }
            container.addEventListener('scrollend', scrollHandler, { once: true });
        });

    const steps = async (): Promise<number> => {
        try {
            const container = document.querySelector('[data-testid="weather-scroll-container"]') as HTMLElement;
            if (!container) throw new Error('weather-scroll-container not found');
            container.focus();

            const scrollAndWait = async (delta: number): Promise<boolean> => {
                const before = container.scrollTop;
                const renderDone = waitForScrollRender(container, t);
                container.scrollBy({ top: delta });
                // If scrollTop didn't change, scroll had no effect (at boundary)
                if (container.scrollTop === before) {
                    // Cancel the pending promise — clean up listener
                    if (renderResolve) {
                        renderResolve();
                        renderResolve = null;
                    }
                    return false;
                }
                await renderDone;
                return true;
            };

            let count = 0;
            const step = container.clientHeight;
            const deadline = performance.now() + durationMs;

            while (performance.now() < deadline) {
                await scrollAndWait(step);
                count++;
                if (performance.now() >= deadline) break;
                await scrollAndWait(step);
                count++;
                if (performance.now() >= deadline) break;
                await scrollAndWait(-step);
                count++;
                if (performance.now() >= deadline) break;
                await scrollAndWait(-step);
                count++;
            }

            log(`completed ${count} virtual scroll operations in ${durationMs}ms`);
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
 * loop for durationMs. Returns the number of completed click+render cycles.
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

        log(`counter bench completed: ${count} ops`);
        return count;
    } finally {
        // Navigate back to home for subsequent walkthroughs
        await page.goto(url, { timeout, waitUntil: 'load' }).catch(() => { /* ignore */ });
    }
}

/**
 * Navigates to the Weather page and scrolls the Virtualize grid up/down
 * in a loop for durationMs. Returns the number of scroll+render cycles.
 */
export async function runBlazorVirtualScroll(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    const { page, url, timeout, verbose = false, durationMs = 60_000 } = opts;
    const log = verbose ? (msg: string) => debug(`VScroll: ${msg}`) : () => { };

    try {
        // Load home & wait for Blazor startup
        log('navigating to home...');
        await page.goto(url, { timeout, waitUntil: 'load' });
        await page.waitForFunction(
            () => (globalThis as Record<string, unknown>).bench_complete !== undefined,
            null, { timeout },
        );
        log('home loaded');

        // Navigate to weather page via nav link
        await page.evaluate(() => {
            const link = document.querySelector('[data-testid="nav-weather"]') as HTMLElement;
            if (!link) throw new Error('nav-weather link not found');
            link.click();
        });
        await page.waitForSelector('[data-testid="weather-scroll-container"]', { timeout });
        log('weather page loaded');

        // Wait for initial data to render (Virtualize loads asynchronously)
        await page.waitForFunction(
            () => document.querySelectorAll('[data-testid="weather-scroll-container"] tbody tr').length > 0,
            null, { timeout },
        );
        log('weather data rendered');

        // Inject __name helper for esbuild compatibility
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.evaluate(() => { (globalThis as any).__name = (fn: any) => fn; });

        // Run the timed benchmark loop inside the browser
        log(`starting virtual scroll bench (${durationMs}ms)...`);
        const count = await page.evaluate(browserVirtualScrollBench, { timeout, durationMs, verbose });

        log(`virtual scroll bench completed: ${count} ops`);
        return count;
    } finally {
        // Navigate back to home for subsequent walkthroughs
        await page.goto(url, { timeout, waitUntil: 'load' }).catch(() => { /* ignore */ });
    }
}
