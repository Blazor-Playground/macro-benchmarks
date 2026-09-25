import { focusMetrics, isEligible } from './focus-data.js';
import { FocusPublicationError } from './focus-types.js';
import type { FocusColumn, FocusHeader, FocusIndex, FocusPublication, FocusRows } from './focus-types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, where: string): Record<string, unknown> {
    if (!isRecord(value)) {
        throw new FocusPublicationError(`${where}: expected an object.`);
    }
    return value;
}

function text(value: unknown, where: string): string {
    if (typeof value !== 'string' || !value) throw new FocusPublicationError(`${where}: expected a nonempty string.`);
    return value;
}

function strings(value: unknown, where: string): string[] {
    if (!Array.isArray(value)) throw new FocusPublicationError(`${where}: expected an array.`);
    return value.map((item: unknown) => text(item, where));
}

function optionalText(value: unknown, where: string): string | null {
    return value === undefined || value === null ? null : text(value, where);
}

function optionalBoolean(value: unknown, where: string): boolean | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'boolean') throw new FocusPublicationError(`${where}: expected a boolean.`);
    return value;
}

function day(value: unknown, where: string): string {
    const result = text(value, where);
    const parsed = Date.parse(result);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(parsed)
        || new Date(parsed).toISOString().slice(0, 10) !== result) {
        throw new FocusPublicationError(`${where}: invalid UTC calendar day.`);
    }
    return result;
}

function segment(value: string, where: string): string {
    if (!/^[a-zA-Z0-9-]+$/.test(value)) throw new FocusPublicationError(`${where}: invalid path segment.`);
    return value;
}

export function parseFocusIndex(value: unknown): FocusIndex {
    const input = record(value, 'View index');
    const lastUpdated = text(input.lastUpdated, 'View index lastUpdated');
    if (!Number.isFinite(Date.parse(lastUpdated))) throw new FocusPublicationError('View index lastUpdated is invalid.');
    return {
        lastUpdated,
        apps: strings(input.apps, 'View index apps').map(app => segment(app, 'App ID')),
        weeks: strings(input.weeks, 'View index weeks').map(week => day(week, 'Week bucket')),
        releases: strings(input.releases, 'View index releases').map(release => segment(release, 'Release bucket')),
    };
}

export function parseFocusHeader(value: unknown, path: string): FocusHeader {
    const input = record(value, path);
    if (!Array.isArray(input.columns)) throw new FocusPublicationError(`${path}: columns must be an array.`);
    const columns = input.columns.map((raw: unknown, i: number): FocusColumn => {
        const column = record(raw, `${path} column ${i}`);
        const field = (key: string) => `${path} column ${i} ${key}`;
        if (typeof column.major !== 'number' || !Number.isInteger(column.major)) {
            throw new FocusPublicationError(`${field('major')}: expected an integer.`);
        }
        return {
            sdkVersion: text(column.sdkVersion, field('sdkVersion')),
            releaseDate: day(column.releaseDate, field('releaseDate')),
            major: column.major,
            channel: text(column.channel, field('channel')),
            sdkGitHash: text(column.sdkGitHash, field('sdkGitHash')),
            vmrGitHash: text(column.vmrGitHash, field('vmrGitHash')),
            runtimeGitHash: text(column.runtimeGitHash, field('runtimeGitHash')),
            aspnetCoreGitHash: text(column.aspnetCoreGitHash, field('aspnetCoreGitHash')),
            runtimePackVersion: optionalText(column.runtimePackVersion, field('runtimePackVersion')),
            aspnetCoreVersion: optionalText(column.aspnetCoreVersion, field('aspnetCoreVersion')),
            workloadVersion: optionalText(column.workloadVersion, field('workloadVersion')),
            bootstrapSdkVersion: optionalText(column.bootstrapSdkVersion, field('bootstrapSdkVersion')),
            bundledFrameworkTfm: optionalText(column.bundledFrameworkTfm, field('bundledFrameworkTfm')),
            runtimeCommitDateTime: optionalText(column.runtimeCommitDateTime, field('runtimeCommitDateTime')),
            isRuntimeCustomBuild: optionalBoolean(column.isRuntimeCustomBuild, field('isRuntimeCustomBuild')),
            isAspnetCoreCustomBuild: optionalBoolean(column.isAspnetCoreCustomBuild, field('isAspnetCoreCustomBuild')),
            runtimePR: optionalText(column.runtimePR, field('runtimePR')),
            aspnetCorePR: optionalText(column.aspnetCorePR, field('aspnetCorePR')),
        };
    });
    const apps: Record<string, string[]> = {};
    for (const [app, metrics] of Object.entries(record(input.apps, `${path} apps`))) {
        apps[segment(app, 'App ID')] = strings(metrics, `${path} ${app}`).map(metric => segment(metric, 'Metric key'));
    }
    return { columns, apps };
}

export function parseFocusRows(value: unknown, count: number, path: string): FocusRows {
    const rows = record(value, path);
    if (Object.keys(rows).length === 0) throw new FocusPublicationError(`${path}: advertised metric has no rows.`);
    const result: FocusRows = {};
    for (const [key, values] of Object.entries(rows)) {
        if (!/^[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/.test(key)) {
            throw new FocusPublicationError(`${path}: invalid row identity '${key}'.`);
        }
        if (!Array.isArray(values) || values.length !== count) {
            throw new FocusPublicationError(`${path}: ${key} does not match the header's ${count} columns.`);
        }
        result[key] = values.map((value: unknown) => {
            if (value === null || (typeof value === 'number' && Number.isFinite(value))) return value;
            throw new FocusPublicationError(`${path}: ${key} contains a nonnumeric measurement.`);
        });
    }
    return result;
}

export class FocusLoader {
    private marker = '';
    private cache = new Map<string, unknown>();

    constructor(
        private readonly root: URL,
        private readonly request: typeof fetch = (url, options) => globalThis.fetch(url, options),
    ) {}

    private async json(path: string, signal: AbortSignal, cached = false): Promise<unknown> {
        const cache = this.cache;
        if (cached && cache.has(path)) return cache.get(path);
        let response: Response;
        try {
            response = await this.request(new URL(path, this.root), { signal, cache: 'no-store' });
        } catch (error) {
            if (signal.aborted) throw error;
            throw new FocusPublicationError(`Cannot fetch ${path}. Check the connection and retry. ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!response.ok) throw new FocusPublicationError(`${path}: HTTP ${response.status}. An advertised resource could not be loaded.`);
        let value: unknown;
        try {
            value = await response.json();
        } catch (error) {
            if (signal.aborted) throw error;
            throw new FocusPublicationError(`${path}: invalid JSON. ${error instanceof Error ? error.message : String(error)}`);
        }
        signal.throwIfAborted();
        if (cached) cache.set(path, value);
        return value;
    }

    async load(app: string, signal: AbortSignal, force = false): Promise<FocusPublication> {
        segment(app, 'App ID');
        if (force) this.cache = new Map();
        for (let attempt = 0; attempt < 2; attempt++) {
            const index = parseFocusIndex(await this.json('index.json', signal));
            const marker = JSON.stringify(index);
            if (marker !== this.marker) {
                this.cache = new Map();
                this.marker = marker;
            }
            let publication: FocusPublication | undefined;
            let resourceError: unknown;
            try {
                if (!index.apps.includes(app)) throw new FocusPublicationError(`Application '${app}' is no longer in the published index.`);
                const paths = [...index.weeks, ...index.releases.map(release => `releases/${release}`)];
                if (new Set(paths).size !== paths.length) throw new FocusPublicationError('Duplicate buckets in the view index.');
                const headers = await Promise.all(paths.map(async path => ({
                    path, header: parseFocusHeader(await this.json(`${path}/header.json`, signal, true), path),
                })));
                // Commit-week names cannot determine SDK build-day ranges; inspect the columns first.
                const buckets = await Promise.all(headers.filter(bucket => bucket.header.columns.some(isEligible)).map(async bucket => {
                    const metrics: Record<string, FocusRows> = {};
                    await Promise.all(focusMetrics(app).map(async definition => {
                        const key = definition.key;
                        if (key === null || !(bucket.header.apps[app] ?? []).includes(key)) return;
                        const path = `${bucket.path}/${app}_${key}.json`;
                        metrics[key] = parseFocusRows(await this.json(path, signal, true), bucket.header.columns.length, path);
                    }));
                    return { ...bucket, metrics };
                }));
                publication = { index, buckets };
            } catch (error) {
                if (signal.aborted) throw error;
                resourceError = error;
            }
            signal.throwIfAborted();
            const after = parseFocusIndex(await this.json('index.json', signal));
            if (JSON.stringify(after) !== marker) {
                this.cache = new Map();
                if (attempt === 0) continue;
                throw new FocusPublicationError('The publication changed repeatedly while loading. Retry after it finishes updating.');
            }
            if (resourceError !== undefined) {
                this.cache = new Map();
                if (attempt === 0 && resourceError instanceof FocusPublicationError) continue;
                throw resourceError;
            }
            if (!publication) throw new FocusPublicationError('The publication could not be assembled.');
            return publication;
        }
        throw new FocusPublicationError('The publication remained inconsistent after retrying.');
    }
}
