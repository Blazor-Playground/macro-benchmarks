import { createHash } from 'node:crypto';
import { sortedMedian } from './stats.js';

export const DEBUG_METHOD = 'debug-sdk-defaults-v1';
export const DEBUG_APPS = ['empty-blazor', 'havit-bootstrap'] as const;
export const DEBUG_SCENARIOS = ['first-run', 'incremental-run', 'rebuild', 'hot-reload', 'walkthrough'] as const;
export type DebugScenario = typeof DEBUG_SCENARIOS[number];
export type DebugRuntime = 'mono' | 'coreclr';
export const DEBUG_KEYS = [
    'debug-first-run-to-first-render', 'debug-incremental-run-to-first-render',
    'debug-rebuild-edit-to-render', 'debug-incremental-build', 'debug-hot-reload-edit-to-render',
    'havit-walkthrough',
] as const;
export type DebugKey = typeof DEBUG_KEYS[number];
export const DEBUG_OUTCOMES = [
    'ok', 'not-run', 'unsupported-runtime', 'unsupported-app', 'unsupported-edit',
    'build-failed', 'launch-failed', 'transport-failed', 'timeout', 'unexpected-reload',
    'unexpected-restart', 'invalid-sample', 'cancelled',
] as const;
export type DebugOutcome = typeof DEBUG_OUTCOMES[number];

export interface RenderEvidence {
    version: string;
    documentId: string;
    runtimeId: string;
    generation: number;
    counter: number;
    debuggerAttached: boolean;
    metadataUpdates: boolean;
    runtime: DebugRuntime;
}

export interface DebugAttempt {
    trial: number;
    status: DebugOutcome;
    reason: string;
    startedAt: string;
    valueMs: number | null;
    phases: Record<string, number>;
    commands: string[][];
    sourceBefore: string;
    sourceAfter: string;
    before?: RenderEvidence;
    after?: RenderEvidence;
    navigations?: number;
    contextResets?: number;
    hostPidsBefore?: number[];
    hostPidsAfter?: number[];
    properties?: Record<string, string>;
}

export interface DebugMeasurement {
    status: DebugOutcome | 'partial';
    reason: string;
    requested: number;
    successful: number;
    valueMs: number | null;
    aggregation: 'median';
    attempts: DebugAttempt[];
}

export interface DebugBatch {
    kind: 'debug-dev-loop';
    schemaVersion: 1;
    methodology: string;
    id: string;
    app: string;
    // "debug" is read-only compatibility for earlier clean-Debug prototype results.
    preset: 'dev-loop' | 'debug';
    configuration: 'Debug';
    measuredAt: string;
    smoke: boolean;
    sdk: {
        version: string;
        day: string | null;
        sdkHash: string | null;
        runtimeHash: string | null;
        aspnetHash: string | null;
        vmrHash: string | null;
    };
    source: { harnessSha: string; harnessDigest: string; appDigest: string };
    environment: {
        os: string;
        arch: string;
        cpu: string;
        cpuCount: number;
        memoryBytes: number;
        browser: string;
        browserChannel: string;
        playwright: string;
        node?: string;
        headless: boolean;
        runnerClass: string;
        runnerId: string;
        controlled: boolean;
        comparisonScope?: 'local-paired' | 'ci-paired';
        policy: string;
    };
    runtimes: Record<DebugRuntime, {
        properties: Record<string, string>;
        measurements: Record<DebugKey, DebugMeasurement>;
    }>;
}

export function digest(value: string | Uint8Array): string {
    return createHash('sha256').update(value).digest('hex');
}

export function summarizeDebug(attempts: DebugAttempt[], requested: number): DebugMeasurement {
    const good = attempts.filter(attempt => attempt.status === 'ok');
    if (good.some(attempt => attempt.valueMs === null || !Number.isFinite(attempt.valueMs) || attempt.valueMs <= 0)) {
        throw new Error('Successful Debug attempts require a finite positive duration');
    }
    const status = good.length === requested ? 'ok' : good.length ? 'partial' : attempts[0]?.status ?? 'not-run';
    return {
        status, reason: status === 'ok' ? '' : [...new Set(attempts.filter(a => a.status !== 'ok').map(a => a.reason))].join('; ')
            || (attempts.length ? 'Incomplete sample set' : 'Not requested'),
        requested, successful: good.length, valueMs: sortedMedian(good.map(a => a.valueMs!)),
        aggregation: 'median', attempts,
    };
}

export function emptyDebugMeasurements(requested: number): Record<DebugKey, DebugMeasurement> {
    return Object.fromEntries(DEBUG_KEYS.map(key => [key, summarizeDebug([], requested)])) as Record<DebugKey, DebugMeasurement>;
}

export function scenarioKeys(scenario: DebugScenario): DebugKey[] {
    switch (scenario) {
        case 'first-run': return ['debug-first-run-to-first-render'];
        case 'incremental-run': return ['debug-incremental-run-to-first-render'];
        case 'rebuild': return ['debug-rebuild-edit-to-render', 'debug-incremental-build'];
        case 'hot-reload': return ['debug-hot-reload-edit-to-render'];
        case 'walkthrough': return ['havit-walkthrough'];
    }
}

export function hotReloadFailure(before: RenderEvidence, after: RenderEvidence, navigations: number,
    contextResets: number, beforePids: number[], afterPids: number[]): DebugOutcome | null {
    if (navigations || contextResets || before.documentId !== after.documentId) return 'unexpected-reload';
    if (before.runtimeId !== after.runtimeId || !beforePids.length
        || JSON.stringify(beforePids) !== JSON.stringify(afterPids)) return 'unexpected-restart';
    if (after.version !== 'after--0001' || after.generation <= before.generation
        || after.counter !== before.counter || after.counter < 1 || after.debuggerAttached
        || !after.metadataUpdates || after.runtime !== before.runtime) return 'invalid-sample';
    return null;
}

/** Reject malformed input before any publication can turn failed trials into numbers. */
export function validateDebugBatch(value: unknown): asserts value is DebugBatch {
    const fail = () => { throw new Error('Invalid clean-Debug result schema'); };
    if (!value || typeof value !== 'object') return fail();
    const b = value as DebugBatch;
    if (b.kind !== 'debug-dev-loop' || b.schemaVersion !== 1 || (b.preset !== 'dev-loop' && b.preset !== 'debug') || b.configuration !== 'Debug'
        || typeof b.id !== 'string' || !b.id || typeof b.app !== 'string' || !/^[a-z0-9-]+$/.test(b.app)
        || b.methodology !== DEBUG_METHOD || !Number.isFinite(Date.parse(b.measuredAt))
        || typeof b.smoke !== 'boolean' || !b.sdk || !/^\d+\.\d+\.\d+/.test(b.sdk.version)
        || (b.sdk.day !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(b.sdk.day)
            || new Date(b.sdk.day).toISOString().slice(0, 10) !== b.sdk.day))
        || !b.source || Object.values(b.source).length !== 3 || Object.values(b.source).some(v => typeof v !== 'string' || !v)
        || !b.environment || typeof b.environment.runnerId !== 'string' || !b.environment.runnerId
        || typeof b.environment.controlled !== 'boolean' || !b.runtimes
        || (b.environment.comparisonScope !== undefined
            && !['local-paired', 'ci-paired'].includes(b.environment.comparisonScope))
        || (b.environment.comparisonScope === 'local-paired' && b.environment.controlled)) return fail();
    for (const runtime of ['mono', 'coreclr'] as const) {
        const r = b.runtimes[runtime];
        if (!r || !r.properties || Object.values(r.properties).some(v => typeof v !== 'string') || !r.measurements) return fail();
        for (const key of DEBUG_KEYS) {
            const m = r.measurements[key];
            if (!m || !Number.isInteger(m.requested) || m.requested < 1 || !Array.isArray(m.attempts)
                || m.attempts.length > m.requested) return fail();
            const trials = new Set<number>();
            for (const a of m.attempts) {
                if (!DEBUG_OUTCOMES.includes(a.status) || !Number.isInteger(a.trial) || a.trial < 1 || a.trial > m.requested
                    || trials.has(a.trial) || !Number.isFinite(Date.parse(a.startedAt)) || typeof a.reason !== 'string'
                    || !a.phases || Object.values(a.phases).some(v => !Number.isFinite(v) || v < 0)
                    || !Array.isArray(a.commands) || typeof a.sourceBefore !== 'string' || typeof a.sourceAfter !== 'string'
                    || (a.status !== 'ok' && a.valueMs !== null)) return fail();
                trials.add(a.trial);
                if (a.status === 'ok' && (r.properties.Configuration !== 'Debug' || !r.properties.TargetFramework
                    || a.properties?.Configuration !== 'Debug' || !a.properties.TargetFramework)) return fail();
                if (a.status === 'ok' && key === 'debug-hot-reload-edit-to-render'
                    && (!a.before || !a.after || hotReloadFailure(a.before, a.after,
                        a.navigations ?? -1, a.contextResets ?? -1, a.hostPidsBefore ?? [], a.hostPidsAfter ?? []))) return fail();
            }
            const expected = summarizeDebug(m.attempts, m.requested);
            if (m.status !== expected.status || m.successful !== expected.successful
                || m.valueMs !== expected.valueMs || m.aggregation !== 'median' || m.reason !== expected.reason) return fail();
        }
    }
}
