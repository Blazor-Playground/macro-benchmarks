/**
 * avalonia-scenarios.ts — generic driver for avalonia-bench scenarios.
 *
 * Scenario logic lives in the app itself (C# in src/avalonia-bench/Scenarios, JS input drivers in
 * src/avalonia-bench/wwwroot/main.mjs) and is exposed as `globalThis.avaloniaBench.run(name, opts)`.
 * This module only runs a scenario inside the page (single page.evaluate, so Playwright round-trips
 * are not measured) and reduces its per-sample values to a median.
 */

import { debug } from '../log.js';
import { sortedMedian } from './stats.js';
import { type WalkthroughOpts } from './walkthrough-types.js';

// Minimal Playwright Page type surface used by the driver
type ScenarioPage = {
    waitForFunction(fn: () => boolean, arg: unknown, options?: { timeout?: number }): Promise<unknown>;
    evaluate<T>(fn: (arg: unknown) => T | Promise<T>, arg?: unknown): Promise<T>;
};

export interface AvaloniaScenarioOptions {
    /** Measured samples per run (default 5). */
    samples?: number;
    /** Discarded warm-up samples per run (default 1). */
    warmup?: number;
    /** Upper bound for one managed/frames sample in ms (default 1000); shortened for dry runs. */
    sampleDurationMs?: number;
}

export function avaloniaScenario(name: string, options: AvaloniaScenarioOptions = {}) {
    const samples = options.samples ?? 5;
    const warmup = options.warmup ?? 1;

    return async (opts: WalkthroughOpts<ScenarioPage>): Promise<number> => {
        const { page, timeout, verbose = false, durationMs = 60_000 } = opts;
        if (!page) throw new Error(`Avalonia scenario '${name}' requires a browser page`);

        // Managed/frames scenarios run for sampleDurationMs per sample; keep dry runs short.
        const budgetMs = Math.floor(durationMs / (samples + warmup) / 4);
        const sampleDurationMs = Math.max(100, Math.min(options.sampleDurationMs ?? 1000, budgetMs));

        await page.waitForFunction(
            () => (globalThis as Record<string, unknown>).avaloniaBench !== undefined,
            null, { timeout },
        );

        // esbuild's keepNames may inject __name() into serialized functions; provide the helper.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.evaluate(() => { (globalThis as any).__name = (fn: unknown) => fn; });
        const values = await page.evaluate(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (arg: unknown) => (globalThis as any).avaloniaBench.run((arg as { name: string }).name, arg) as Promise<number[]>,
            { name, samples, warmup, sampleDurationMs, timeoutMs: timeout },
        );

        const result = sortedMedian(values);
        if (result == null) throw new Error(`Avalonia scenario '${name}' returned no samples`);
        if (verbose) debug(`avalonia-scenario ${name}: [${values.map(v => Math.round(v)).join(', ')}] → median=${Math.round(result)}`);
        return result;
    };
}
