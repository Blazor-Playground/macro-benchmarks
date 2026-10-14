import { setTimeout as sleep } from 'node:timers/promises';
import type { Page } from 'playwright';
import type { RenderEvidence } from './debug-results.js';
import type { DebugProcess } from './debug-process.js';

export interface ObservedRender { at: number; evidence: RenderEvidence }

export class DebugProbe {
    readonly events: ObservedRender[] = [];
    readonly deltas: { at: number; generation: number }[] = [];
    navigations = 0;
    contextResets = 0;
    error: Error | null = null;

    async install(page: Page, app: string): Promise<void> {
        page.on('framenavigated', frame => { if (frame === page.mainFrame()) this.navigations++; });
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Runtime.enable');
        cdp.on('Runtime.executionContextsCleared', () => this.contextResets++);
        await page.exposeBinding('debugBenchmarkReport', ({ frame }, evidence: RenderEvidence) => {
            if (frame !== page.mainFrame()) return;
            if (!evidence || typeof evidence.version !== 'string' || !evidence.documentId || !evidence.runtimeId
                || !Number.isInteger(evidence.generation) || !Number.isInteger(evidence.counter)
                || typeof evidence.debuggerAttached !== 'boolean' || typeof evidence.metadataUpdates !== 'boolean'
                || !['mono', 'coreclr'].includes(evidence.runtime)) {
                this.error = new Error('Invalid render acknowledgement');
                return;
            }
            this.events.push({ at: performance.now(), evidence });
        });
        await page.exposeBinding('debugBenchmarkDelta', ({ frame }, generation: number) => {
            if (frame === page.mainFrame() && Number.isInteger(generation) && generation > 0) {
                this.deltas.push({ at: performance.now(), generation });
            } else this.error = new Error('Invalid metadata-update acknowledgement');
        });
        await page.addInitScript(({ selector }) => {
            const target = globalThis as typeof globalThis & {
                debugBenchmarkReport: (data: RenderEvidence) => Promise<void>;
                debugBenchmarkDelta: (generation: number) => Promise<void>;
                debugBenchmark: {
                    applied: (generation: number) => void;
                    rendered: (...args: [string, string, number, number, boolean, boolean, 'mono' | 'coreclr']) => Promise<void>;
                };
            };
            const documentId = crypto.randomUUID();
            let appliedGeneration = 0;
            target.debugBenchmark = {
                applied(generation) {
                    appliedGeneration = generation;
                    void target.debugBenchmarkDelta(generation);
                },
                async rendered(version, runtimeId, generation, counter, debuggerAttached, metadataUpdates, runtime) {
                    // Two frame callbacks acknowledge a DOM commit plus a paint opportunity, not LCP.
                    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
                    if (!document.querySelector(selector)
                        || document.getElementById('debug-benchmark-probe')?.dataset.version !== version) return;
                    // Blazor's handler can render before the app's metadata handler runs.
                    // Join both real acknowledgements at the post-render boundary.
                    await target.debugBenchmarkReport({ version, documentId, runtimeId, generation: Math.max(generation, appliedGeneration), counter,
                        debuggerAttached, metadataUpdates, runtime });
                },
            };
        }, { selector: app === 'havit-bootstrap' ? 'h1#getting-started' : '#app h1' });
    }

    async waitFor(predicate: (value: RenderEvidence) => boolean, after: number,
        proc: DebugProcess, timeout: number, signal: AbortSignal): Promise<ObservedRender> {
        const deadline = performance.now() + timeout;
        while (performance.now() < deadline) {
            signal.throwIfAborted();
            if (this.error) throw this.error;
            proc.check();
            const event = this.events.find(event => event.at >= after && predicate(event.evidence));
            if (event) return event;
            await sleep(10);
        }
        throw new Error('Render acknowledgement timeout');
    }
}
