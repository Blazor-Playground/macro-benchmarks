/**
 * uno-walkthrough.ts — Playwright walkthrough for Uno Gallery app.
 *
 * Measures total wall-clock time from fresh navigation to completion.
 *
 * TODO: implement actual walkthrough steps.
 */

import { debug } from '../log.js';

// Minimal Playwright Page type surface used by the walkthrough
type PlaywrightPage = {
    goto(url: string, options?: { timeout?: number; waitUntil?: string }): Promise<unknown>;
    waitForSelector(selector: string, options?: { timeout?: number; state?: string }): Promise<unknown>;
    waitForFunction(fn: (() => boolean) | string, arg: unknown, options?: { timeout?: number }): Promise<unknown>;
    evaluate<T>(fn: (() => T) | ((arg: string) => T), arg?: string): Promise<T>;
};

/**
 * Stub walkthrough: navigates to the page and returns wall-clock time.
 * Returns wall-clock duration in ms.
 */
export async function runUnoWalkthrough(
    page: PlaywrightPage,
    url: string,
    timeout: number,
    verbose = false,
): Promise<number> {
    const log = verbose ? (msg: string) => debug(`Uno: ${msg}`) : () => { };

    log('navigating to home...');
    await page.goto(url, { timeout, waitUntil: 'load' });
    await page.waitForFunction(
        () => (globalThis as Record<string, unknown>).bench_complete !== undefined,
        null, { timeout },
    );
    log('home loaded');

    const startTime: number = await page.evaluate(() => performance.now());

    // TODO: add actual UI interaction steps here

    const endTime: number = await page.evaluate(() => performance.now());
    const duration = Math.round(endTime - startTime);
    log(`walkthrough complete: ${duration}ms`);

    return duration;
}
