import type { DebugBatch, DebugIndex, DebugMeasurement, DebugPublication } from './debug-types.js';

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Debug publication: expected object');
    return value as Record<string, unknown>;
}
function text(value: unknown): string {
    if (typeof value !== 'string' || !value) throw new Error('Invalid Debug publication: expected text');
    return value;
}
function flag(value: unknown): boolean {
    if (typeof value !== 'boolean') throw new Error('Invalid Debug publication: expected boolean');
    return value;
}
function count(value: unknown): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error('Invalid Debug sample count');
    return value;
}
function utcDay(value: unknown): string | null {
    if (value === null) return null;
    const day = text(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) {
        throw new Error('Invalid Debug SDK day');
    }
    return day;
}
function timestamp(value: unknown): string {
    const result = text(value);
    if (!Number.isFinite(Date.parse(result))) throw new Error('Invalid Debug timestamp');
    return result;
}
function segment(value: unknown): string {
    const result = text(value);
    if (!/^[a-z0-9-]+$/.test(result)) throw new Error('Invalid Debug app ID');
    return result;
}

export function parseDebugIndex(value: unknown): DebugIndex {
    const index = record(value);
    if (index.schemaVersion !== 1 || !Array.isArray(index.apps)) throw new Error('Unsupported Debug publication schema');
    const generation = text(index.generation);
    if (!/^[a-f0-9]{64}$/.test(generation)) throw new Error('Invalid Debug generation');
    const apps = index.apps.map(raw => {
        const app = record(raw);
        const id = segment(app.id);
        const file = text(app.file);
        if (file !== `generations/${generation}/${id}.json`) throw new Error('Debug resource does not match publication generation');
        return { id, file };
    });
    if (new Set(apps.map(a => a.id)).size !== apps.length) throw new Error('Duplicate Debug apps');
    return { schemaVersion: 1, generation, lastUpdated: timestamp(index.lastUpdated), apps };
}

function measurement(raw: unknown): DebugMeasurement {
    const m = record(raw);
    const status = text(m.status);
    if (!['ok', 'partial', 'not-run', 'unsupported-runtime', 'unsupported-app', 'unsupported-edit', 'build-failed',
        'launch-failed', 'transport-failed', 'timeout', 'unexpected-reload', 'unexpected-restart', 'invalid-sample', 'cancelled'].includes(status)) {
        throw new Error(`Unknown Debug outcome ${status}`);
    }
    const successful = count(m.successful), requested = count(m.requested);
    const value = m.valueMs;
    if (!requested || successful > requested || m.aggregation !== 'median'
        || (successful === 0 ? value !== null : typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
        || (status === 'ok' ? successful !== requested : status === 'partial' ? successful === 0 || successful === requested : successful !== 0)
        || typeof m.reason !== 'string' || (status !== 'ok' && !m.reason)) throw new Error('Inconsistent Debug metric status/value/count');
    if (!Array.isArray(m.attempts) || m.attempts.length > requested) throw new Error('Missing Debug attempt evidence');
    const samples: number[] = [];
    const trials = new Set<number>();
    let properties: Record<string, string> = {};
    for (const item of m.attempts) {
        const attempt = record(item), trial = count(attempt.trial);
        if (!trial || trial > requested || trials.has(trial)) throw new Error('Invalid Debug trial identity');
        trials.add(trial);
        if (attempt.properties) {
            const props = record(attempt.properties);
            for (const [key, value] of Object.entries(props)) {
                if (typeof value !== 'string') throw new Error('Invalid per-attempt evaluated property');
                properties[key] = value;
            }
        }
        if (attempt.status === 'ok') {
            if (typeof attempt.valueMs !== 'number' || !Number.isFinite(attempt.valueMs) || attempt.valueMs <= 0) throw new Error('Invalid Debug duration');
            if (properties.Configuration !== 'Debug' || !properties.TargetFramework) throw new Error('Missing per-attempt clean-Debug configuration');
            samples.push(attempt.valueMs);
        } else if (attempt.valueMs !== null) throw new Error('Failed Debug trial has a numeric duration');
    }
    samples.sort((a, b) => a - b);
    const median = samples.length ? (samples[Math.floor((samples.length - 1) / 2)] + samples[Math.floor(samples.length / 2)]) / 2 : null;
    if (samples.length !== successful || median !== value) throw new Error('Debug aggregate does not match raw attempts');
    return { status, reason: m.reason, successful, requested, valueMs: value as number | null, aggregation: 'median', properties };
}

export function parseDebugPayload(value: unknown, index: DebugIndex, app: string): DebugBatch[] {
    const payload = record(value);
    if (payload.schemaVersion !== 1 || payload.generation !== index.generation || payload.app !== app || !Array.isArray(payload.batches)) {
        throw new Error('Debug payload does not match its index');
    }
    const ids = new Set<string>();
    return payload.batches.map(raw => {
        const b = record(raw), sdk = record(b.sdk), source = record(b.source), environment = record(b.environment), runtimes = record(b.runtimes);
        const id = text(b.id);
        if (ids.has(id)) throw new Error('Duplicate Debug batch');
        ids.add(id);
        const comparisonScope = environment.comparisonScope;
        if (comparisonScope !== undefined && comparisonScope !== 'local-paired' && comparisonScope !== 'ci-paired') {
            throw new Error('Invalid Debug comparison scope');
        }
        if (comparisonScope === 'local-paired' && environment.controlled !== false) {
            throw new Error('Local Debug experiments must not claim CI control');
        }
        if (b.kind !== 'debug-dev-loop' || b.schemaVersion !== 1 || b.app !== app
            || (b.preset !== 'dev-loop' && b.preset !== 'debug') || b.configuration !== 'Debug'
            || b.methodology !== 'debug-sdk-defaults-v1') throw new Error('Not a supported clean-Debug cohort');
        const runtime = (name: string) => {
            const r = record(runtimes[name]), rawProps = record(r.properties);
            const properties: Record<string, string> = {};
            for (const [key, value] of Object.entries(rawProps)) {
                if (typeof value !== 'string') throw new Error('Invalid evaluated Debug property');
                properties[key] = value;
            }
            const measurements = Object.fromEntries(Object.entries(record(r.measurements)).map(([key, value]) => [key, measurement(value)]));
            for (const key of ['debug-first-run-to-first-render', 'debug-incremental-run-to-first-render', 'debug-hot-reload-edit-to-render',
                'debug-rebuild-edit-to-render', 'debug-incremental-build', 'havit-walkthrough']) {
                if (!measurements[key]) throw new Error(`Missing Debug outcome for ${key}`);
            }
            if (Object.values(measurements).some(m => m.successful) && (properties.Configuration !== 'Debug' || !properties.TargetFramework)) {
                throw new Error('Successful result without evaluated clean-Debug configuration');
            }
            return { properties, measurements };
        };
        return {
            id, app, preset: b.preset, methodology: b.methodology, measuredAt: timestamp(b.measuredAt), smoke: flag(b.smoke),
            sdk: { version: text(sdk.version), day: utcDay(sdk.day) },
            source: { harnessSha: text(source.harnessSha), harnessDigest: text(source.harnessDigest), appDigest: text(source.appDigest) },
            environment: {
                os: text(environment.os), arch: text(environment.arch), cpu: text(environment.cpu), cpuCount: count(environment.cpuCount),
                memoryBytes: count(environment.memoryBytes),
                browser: text(environment.browser), browserChannel: text(environment.browserChannel), playwright: text(environment.playwright),
                node: environment.node === undefined ? 'unknown' : text(environment.node),
                headless: flag(environment.headless), runnerClass: text(environment.runnerClass), runnerId: text(environment.runnerId),
                controlled: flag(environment.controlled), policy: text(environment.policy),
                ...(comparisonScope ? { comparisonScope } : {}),
            },
            runtimes: { mono: runtime('mono'), coreclr: runtime('coreclr') },
        };
    });
}

export class DebugLoader {
    private cache = new Map<string, DebugPublication>();
    constructor(private readonly root: URL, private readonly request: typeof fetch = (url, init) => globalThis.fetch(url, init)) {}
    private async json(path: string, signal: AbortSignal): Promise<unknown> {
        const response = await this.request(new URL(path, this.root), { signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`Debug ${path}: HTTP ${response.status}. No legacy measurements were substituted.`);
        return response.json();
    }
    async load(app: string, signal: AbortSignal, force = false): Promise<DebugPublication> {
        segment(app);
        if (force) this.cache.clear();
        for (let attempt = 0; attempt < 2; attempt++) {
            const index = parseDebugIndex(await this.json('index.json', signal));
            const key = `${index.generation}/${app}`;
            const cached = this.cache.get(key);
            if (cached && !force) return cached;
            const resource = index.apps.find(value => value.id === app);
            let publication: DebugPublication | null = null;
            let error: unknown;
            try {
                publication = { index, batches: resource ? parseDebugPayload(await this.json(resource.file, signal), index, app) : [] };
            } catch (caught) { error = caught; }
            signal.throwIfAborted();
            const after = parseDebugIndex(await this.json('index.json', signal));
            if (after.generation !== index.generation) {
                if (!attempt) continue;
                throw new Error('Debug publication changed repeatedly. Refresh after publication completes.');
            }
            if (error) throw error;
            if (!publication) throw new Error('Incomplete Debug publication');
            this.cache.set(key, publication);
            return publication;
        }
        throw new Error('Could not load a consistent Debug publication');
    }
}
