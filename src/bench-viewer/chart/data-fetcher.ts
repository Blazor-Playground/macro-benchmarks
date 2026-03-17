// HTTP fetch with caching, bucket collection, and data prefetching

import { assert } from './constants.js';

export interface BucketHeader {
    columns: ColumnMetadata[];
    apps?: Record<string, string[]>;
}

export interface ColumnMetadata {
    sdkVersion: string;
    runtimeGitHash: string;
    runtimeCommitDateTime: string;
    releaseDate: string;
    major: number;
    minor: number;
    patch: number;
    channel: string;
    isPrerelease: boolean;
    benchmarkDateTime: string;
    aspnetCoreGitHash: string;
    sdkGitHash: string;
    vmrGitHash: string;
    [key: string]: unknown;
}

export interface ViewIndex {
    apps: string[];
    releases: string[];
    weeks: string[];
    metrics: Record<string, string[]>;
}

export interface Bucket {
    path: string;
    header: BucketHeader;
    type: 'release' | 'week';
    label: string;
}

const cache: Record<string, unknown> = {};

export async function fetchJson<T = unknown>(url: string): Promise<T | null> {
    if (cache[url]) return cache[url] as T;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    cache[url] = data;
    return data as T;
}

export function getCached<T = unknown>(url: string): T | null {
    return (cache[url] as T) || null;
}

function validateHeader(header: BucketHeader, bucketPath: string): void {
    for (let i = 0; i < header.columns.length; i++) {
        const col = header.columns[i];
        const ctx = `${bucketPath} column[${i}]`;
        assert(col.sdkVersion, `missing sdkVersion in ${ctx}`);
        assert(col.runtimeGitHash, `missing runtimeGitHash in ${ctx}`);
        assert(col.runtimeCommitDateTime, `missing runtimeCommitDateTime in ${ctx}`);
        assert(col.releaseDate, `missing releaseDate in ${ctx}`);
        assert(col.major != null, `missing major in ${ctx}`);
        assert(col.minor != null, `missing minor in ${ctx}`);
        assert(col.patch != null, `missing patch in ${ctx}`);
        assert(col.channel, `missing channel in ${ctx}`);
        assert(col.isPrerelease != null, `missing isPrerelease in ${ctx}`);
        assert(col.benchmarkDateTime, `missing benchmarkDateTime in ${ctx}`);
        assert(col.aspnetCoreGitHash, `missing aspnetCoreGitHash in ${ctx}`);
        assert(col.sdkGitHash, `missing sdkGitHash in ${ctx}`);
        assert(col.vmrGitHash, `missing vmrGitHash in ${ctx}`);
    }
}

export async function collectBuckets(dataBaseUrl: string, viewIndex: ViewIndex, showDailyReleases: boolean): Promise<{ releaseBuckets: Bucket[]; weekBuckets: Bucket[] }> {
    const releaseHeaders = await Promise.all(
        viewIndex.releases.map(rel => fetchJson<BucketHeader>(`${dataBaseUrl}/releases/${rel}/header.json`))
    );
    const releaseBuckets: Bucket[] = viewIndex.releases
        .map((rel, i) => ({ path: `releases/${rel}`, header: releaseHeaders[i]!, type: 'release' as const, label: rel }))
        .filter(b => b.header != null);
    for (const b of releaseBuckets) validateHeader(b.header, b.path);
    // Sort release buckets by major version number (ascending: net8, net9, net10)
    releaseBuckets.sort((a, b) => {
        const numA = parseInt(a.label.replace('net', ''), 10) || 0;
        const numB = parseInt(b.label.replace('net', ''), 10) || 0;
        return numA - numB;
    });

    let weekBuckets: Bucket[] = [];
    if (showDailyReleases) {
        const weekHeaders = await Promise.all(
            viewIndex.weeks.map(week => fetchJson<BucketHeader>(`${dataBaseUrl}/${week}/header.json`))
        );
        weekBuckets = viewIndex.weeks
            .map((week, i) => ({ path: week, header: weekHeaders[i]!, type: 'week' as const, label: week }))
            .filter(b => b.header != null);
        for (const b of weekBuckets) validateHeader(b.header, b.path);
    }

    return { releaseBuckets, weekBuckets };
}

export async function prefetchMetricData(dataBaseUrl: string, app: string, metrics: string[], releaseBuckets: Bucket[], weekBuckets: Bucket[], showReleases: boolean, showDailyReleases: boolean): Promise<void> {
    const urls: string[] = [];
    for (const metric of metrics) {
        if (showReleases) {
            for (const bucket of releaseBuckets) {
                const bucketMetrics = bucket.header.apps?.[app];
                if (bucketMetrics && bucketMetrics.includes(metric)) {
                    urls.push(`${dataBaseUrl}/${bucket.path}/${app}_${metric}.json`);
                }
            }
        }
        if (showDailyReleases) {
            for (const bucket of weekBuckets) {
                const bucketMetrics = bucket.header.apps?.[app];
                if (bucketMetrics && bucketMetrics.includes(metric)) {
                    urls.push(`${dataBaseUrl}/${bucket.path}/${app}_${metric}.json`);
                }
            }
        }
    }
    await Promise.all(urls.map(url => fetchJson(url)));
}
