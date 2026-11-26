import { focusMetrics, isEligible, isMonoGa } from './focus-data.js';
import { FocusPublicationError } from './focus-types.js';
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function record(value, where) {
    if (!isRecord(value)) {
        throw new FocusPublicationError(`${where}: expected an object.`);
    }
    return value;
}
function text(value, where) {
    if (typeof value !== 'string' || !value)
        throw new FocusPublicationError(`${where}: expected a nonempty string.`);
    return value;
}
function strings(value, where) {
    if (!Array.isArray(value))
        throw new FocusPublicationError(`${where}: expected an array.`);
    return value.map((item) => text(item, where));
}
function optionalText(value, where) {
    return value === undefined || value === null ? null : text(value, where);
}
function optionalTimestamp(value, where) {
    const result = optionalText(value, where);
    if (result !== null && !Number.isFinite(Date.parse(result))) {
        throw new FocusPublicationError(`${where}: invalid timestamp.`);
    }
    return result;
}
function optionalBoolean(value, where) {
    if (value === undefined || value === null)
        return null;
    if (typeof value !== 'boolean')
        throw new FocusPublicationError(`${where}: expected a boolean.`);
    return value;
}
function runtimeSources(value, where) {
    if (value === undefined || value === null)
        return undefined;
    const sources = record(value, where);
    const result = {};
    for (const [runtime, raw] of Object.entries(sources)) {
        if (runtime !== 'mono' && runtime !== 'coreclr')
            throw new FocusPublicationError(`${where}: invalid runtime ${runtime}.`);
        const source = record(raw, `${where}.${runtime}`);
        const field = (key) => `${where}.${runtime}.${key}`;
        const commit = text(source.commit, field('commit'));
        const committedAt = text(source.committedAt, field('committedAt'));
        if (!/^[a-f0-9]{40}$/i.test(commit) || !Number.isFinite(Date.parse(committedAt))) {
            throw new FocusPublicationError(`${where}.${runtime}: invalid commit or timestamp.`);
        }
        if (typeof source.commitAuthor !== 'string' || typeof source.commitMessage !== 'string') {
            throw new FocusPublicationError(`${where}.${runtime}: expected recorded author/message strings.`);
        }
        result[runtime] = {
            repo: text(source.repo, field('repo')), ref: text(source.ref, field('ref')),
            commit, committedAt, commitAuthor: source.commitAuthor, commitMessage: source.commitMessage,
            sdkVersion: optionalText(source.sdkVersion, field('sdkVersion')),
            targetFramework: optionalText(source.targetFramework, field('targetFramework')),
            runtimePackVersion: optionalText(source.runtimePackVersion, field('runtimePackVersion')),
        };
    }
    return result;
}
function day(value, where) {
    const result = text(value, where);
    const parsed = Date.parse(result);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(parsed)
        || new Date(parsed).toISOString().slice(0, 10) !== result) {
        throw new FocusPublicationError(`${where}: invalid UTC calendar day.`);
    }
    return result;
}
function segment(value, where) {
    if (!/^[a-zA-Z0-9-]+$/.test(value))
        throw new FocusPublicationError(`${where}: invalid path segment.`);
    return value;
}
export function parseFocusIndex(value) {
    const input = record(value, 'View index');
    const lastUpdated = text(input.lastUpdated, 'View index lastUpdated');
    if (!Number.isFinite(Date.parse(lastUpdated)))
        throw new FocusPublicationError('View index lastUpdated is invalid.');
    return {
        lastUpdated,
        apps: strings(input.apps, 'View index apps').map(app => segment(app, 'App ID')),
        weeks: strings(input.weeks, 'View index weeks').map(week => day(week, 'Week bucket')),
        releases: strings(input.releases, 'View index releases').map(release => segment(release, 'Release bucket')),
    };
}
export function parseFocusHeader(value, path) {
    const input = record(value, path);
    if (!Array.isArray(input.columns))
        throw new FocusPublicationError(`${path}: columns must be an array.`);
    const columns = input.columns.map((raw, i) => {
        const column = record(raw, `${path} column ${i}`);
        const field = (key) => `${path} column ${i} ${key}`;
        if (typeof column.major !== 'number' || !Number.isInteger(column.major)) {
            throw new FocusPublicationError(`${field('major')}: expected an integer.`);
        }
        const parsed = {
            sdkVersion: text(column.sdkVersion, field('sdkVersion')),
            releaseDate: day(column.releaseDate, field('releaseDate')),
            major: column.major,
            channel: text(column.channel, field('channel')),
            sdkGitHash: text(column.sdkGitHash, field('sdkGitHash')),
            sdkCommitDateTime: optionalTimestamp(column.sdkCommitDateTime, field('sdkCommitDateTime')),
            vmrGitHash: text(column.vmrGitHash, field('vmrGitHash')),
            vmrCommitDateTime: optionalTimestamp(column.vmrCommitDateTime, field('vmrCommitDateTime')),
            runtimeGitHash: text(column.runtimeGitHash, field('runtimeGitHash')),
            aspnetCoreGitHash: text(column.aspnetCoreGitHash, field('aspnetCoreGitHash')),
            runtimePackVersion: optionalText(column.runtimePackVersion, field('runtimePackVersion')),
            aspnetCoreVersion: optionalText(column.aspnetCoreVersion, field('aspnetCoreVersion')),
            workloadVersion: optionalText(column.workloadVersion, field('workloadVersion')),
            bootstrapSdkVersion: optionalText(column.bootstrapSdkVersion, field('bootstrapSdkVersion')),
            bundledFrameworkTfm: optionalText(column.bundledFrameworkTfm, field('bundledFrameworkTfm')),
            runtimeCommitDateTime: optionalTimestamp(column.runtimeCommitDateTime, field('runtimeCommitDateTime')),
            runtimeCommitAuthor: optionalText(column.runtimeCommitAuthor, field('runtimeCommitAuthor')),
            runtimeCommitMessage: optionalText(column.runtimeCommitMessage, field('runtimeCommitMessage')),
            isRuntimeCustomBuild: optionalBoolean(column.isRuntimeCustomBuild, field('isRuntimeCustomBuild')),
            isAspnetCoreCustomBuild: optionalBoolean(column.isAspnetCoreCustomBuild, field('isAspnetCoreCustomBuild')),
            runtimePR: optionalText(column.runtimePR, field('runtimePR')),
            aspnetCorePR: optionalText(column.aspnetCorePR, field('aspnetCorePR')),
        };
        if (isEligible(parsed)) {
            const sources = runtimeSources(column.runtimeSources, field('runtimeSources'));
            if (sources)
                parsed.runtimeSources = sources;
        }
        return parsed;
    });
    const apps = {};
    for (const [app, metrics] of Object.entries(record(input.apps, `${path} apps`))) {
        apps[segment(app, 'App ID')] = strings(metrics, `${path} ${app}`).map(metric => segment(metric, 'Metric key'));
    }
    const environments = input.environments === undefined ? undefined
        : Object.fromEntries(Object.entries(record(input.environments, `${path} environments`))
            .map(([app, metrics]) => [segment(app, 'App ID'), strings(metrics, `${path} environment metrics`)
                .map(metric => segment(metric, 'Metric key'))]));
    return { columns, apps, ...(environments ? { environments } : {}) };
}
export function parseFocusEnvironments(value, count, path) {
    return Object.fromEntries(Object.entries(record(value, path)).map(([key, cells]) => {
        if (!/^[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/.test(key)
            || !Array.isArray(cells) || cells.length !== count)
            throw new FocusPublicationError(`${path}: invalid environment row.`);
        return [key, cells.map(cell => {
                if (cell === null)
                    return null;
                if (!Array.isArray(cell) || !cell.length)
                    throw new FocusPublicationError(`${path}: expected recorded environments.`);
                return cell.map(raw => {
                    const env = record(raw, path);
                    return { os: text(env.os, `${path} OS`), arch: text(env.arch, `${path} architecture`) };
                });
            })];
    }));
}
export function parseFocusRows(value, count, path) {
    const rows = record(value, path);
    if (Object.keys(rows).length === 0)
        throw new FocusPublicationError(`${path}: advertised metric has no rows.`);
    const result = {};
    for (const [key, values] of Object.entries(rows)) {
        if (!/^[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/.test(key)) {
            throw new FocusPublicationError(`${path}: invalid row identity '${key}'.`);
        }
        if (!Array.isArray(values) || values.length !== count) {
            throw new FocusPublicationError(`${path}: ${key} does not match the header's ${count} columns.`);
        }
        result[key] = values.map((value) => {
            if (value === null || (typeof value === 'number' && Number.isFinite(value)))
                return value;
            throw new FocusPublicationError(`${path}: ${key} contains a nonnumeric measurement.`);
        });
    }
    return result;
}
export class FocusLoader {
    root;
    request;
    marker = '';
    cache = new Map();
    constructor(root, request = (url, options) => globalThis.fetch(url, options)) {
        this.root = root;
        this.request = request;
    }
    async json(path, signal, cached = false) {
        const cache = this.cache;
        if (cached && cache.has(path))
            return cache.get(path);
        let response;
        try {
            response = await this.request(new URL(path, this.root), { signal, cache: 'no-store' });
        }
        catch (error) {
            if (signal.aborted)
                throw error;
            throw new FocusPublicationError(`Cannot fetch ${path}. Check the connection and retry. ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!response.ok)
            throw new FocusPublicationError(`${path}: HTTP ${response.status}. An advertised resource could not be loaded.`);
        let value;
        try {
            value = await response.json();
        }
        catch (error) {
            if (signal.aborted)
                throw error;
            throw new FocusPublicationError(`${path}: invalid JSON. ${error instanceof Error ? error.message : String(error)}`);
        }
        signal.throwIfAborted();
        if (cached)
            cache.set(path, value);
        return value;
    }
    async load(app, signal, force = false) {
        segment(app, 'App ID');
        if (force)
            this.cache = new Map();
        for (let attempt = 0; attempt < 2; attempt++) {
            const index = parseFocusIndex(await this.json('index.json', signal));
            const marker = JSON.stringify(index);
            if (marker !== this.marker) {
                this.cache = new Map();
                this.marker = marker;
            }
            let publication;
            let resourceError;
            try {
                if (!index.apps.includes(app))
                    throw new FocusPublicationError(`Application '${app}' is no longer in the published index.`);
                const paths = [...index.weeks, ...index.releases.map(release => `releases/${release}`)];
                if (new Set(paths).size !== paths.length)
                    throw new FocusPublicationError('Duplicate buckets in the view index.');
                const headers = await Promise.all(paths.map(async (path) => ({
                    path, header: parseFocusHeader(await this.json(`${path}/header.json`, signal, true), path),
                })));
                // Commit-week names cannot determine SDK build-day ranges; inspect the columns first.
                const buckets = await Promise.all(headers.filter(bucket => bucket.header.columns.some(column => isEligible(column) || isMonoGa(column))).map(async (bucket) => {
                    const metrics = {};
                    const environments = {};
                    await Promise.all(focusMetrics(app).map(async (definition) => {
                        const key = definition.key;
                        if (key === null || !(bucket.header.apps[app] ?? []).includes(key))
                            return;
                        const path = `${bucket.path}/${app}_${key}.json`;
                        metrics[key] = parseFocusRows(await this.json(path, signal, true), bucket.header.columns.length, path);
                        if (bucket.header.environments?.[app]?.includes(key)) {
                            const environmentPath = `${bucket.path}/${app}_${key}.environment.json`;
                            environments[key] = parseFocusEnvironments(await this.json(environmentPath, signal, true), bucket.header.columns.length, environmentPath);
                        }
                    }));
                    return { ...bucket, metrics, environments };
                }));
                publication = { index, buckets };
            }
            catch (error) {
                if (signal.aborted)
                    throw error;
                resourceError = error;
            }
            signal.throwIfAborted();
            const after = parseFocusIndex(await this.json('index.json', signal));
            if (JSON.stringify(after) !== marker) {
                this.cache = new Map();
                if (attempt === 0)
                    continue;
                throw new FocusPublicationError('The publication changed repeatedly while loading. Retry after it finishes updating.');
            }
            if (resourceError !== undefined) {
                this.cache = new Map();
                if (attempt === 0 && resourceError instanceof FocusPublicationError)
                    continue;
                throw resourceError;
            }
            if (!publication)
                throw new FocusPublicationError('The publication could not be assembled.');
            return publication;
        }
        throw new FocusPublicationError('The publication remained inconsistent after retrying.');
    }
}
