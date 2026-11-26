import type { Page } from 'playwright';

type RuntimeReadySource = 'withDotnetReady' | 'onDotnetReady' | 'onRuntimeInitialized' | 'create' | 'uno-bootstrap';

export interface StartupSample {
    jsStart: number;
    contentReady: number;
    firstRender: number;
    runtimeInitialized?: number;
    runtimeReady?: { at: number; source: RuntimeReadySource };
}

interface StartupGlobals {
    js_loaded: number;
    bench_content_ready: number;
    bench_first_render: number;
    bench_runtime_initialized?: number;
    bench_runtime_ready?: StartupSample['runtimeReady'];
    benchStartFirstInteraction(timeout: number): Promise<number>;
}

export function hasFirstRender(): boolean {
    return Number.isFinite((globalThis as typeof globalThis & StartupGlobals).bench_first_render);
}

export async function collectStartup(page: Page, timeout: number): Promise<StartupSample> {
    await page.waitForFunction(hasFirstRender, null, { timeout });
    const sample = await page.evaluate(() => {
        const g = globalThis as typeof globalThis & StartupGlobals;
        return {
            jsStart: g.js_loaded,
            contentReady: g.bench_content_ready,
            firstRender: g.bench_first_render,
            runtimeInitialized: g.bench_runtime_initialized,
            runtimeReady: g.bench_runtime_ready,
        };
    });
    if (!Number.isFinite(sample.jsStart) || !Number.isFinite(sample.contentReady) || !Number.isFinite(sample.firstRender) ||
        (sample.runtimeInitialized !== undefined && !Number.isFinite(sample.runtimeInitialized)) ||
        (sample.runtimeReady !== undefined && !Number.isFinite(sample.runtimeReady.at)) ||
        sample.contentReady < sample.jsStart || sample.firstRender < sample.contentReady) {
        throw new Error(`Invalid startup milestones at ${page.url()}: ${JSON.stringify(sample)}`);
    }
    return sample;
}

export async function measureFirstInteraction(page: Page, timeout: number): Promise<number> {
    const duration = await page.evaluate(async timeoutMs => {
        const g = globalThis as typeof globalThis & StartupGlobals;
        if (!Number.isFinite(g.bench_first_render)) throw new Error('Initial content has not rendered.');
        if (typeof g.benchStartFirstInteraction !== 'function') throw new Error('The app has no first-interaction probe.');
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error('Timed out waiting for the first-interaction response.')), timeoutMs);
                }),
                g.benchStartFirstInteraction(timeoutMs),
            ]);
        } finally {
            clearTimeout(timer);
        }
    }, timeout);
    if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error(`Invalid first interaction at ${page.url()}: ${duration}`);
    }
    return duration;
}
