// HTTP fetch with caching, bucket collection, and data prefetching

export interface BucketHeader {
    columns: ColumnMetadata[];
    apps?: Record<string, string[]>;
}

export interface ColumnMetadata {
    sdkVersion?: string;
    runtimeGitHash?: string;
    runtimeCommitDateTime?: string;
    isPrerelease?: boolean;
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
    type: string;
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

export async function collectBuckets(dataBaseUrl: string, viewIndex: ViewIndex, showDailyReleases: boolean): Promise<{ releaseBuckets: Bucket[]; weekBuckets: Bucket[] }> {
    const releaseHeaders = await Promise.all(
        viewIndex.releases.map(rel => fetchJson<BucketHeader>(`${dataBaseUrl}/releases/${rel}/header.json`))
    );
    const releaseBuckets: Bucket[] = viewIndex.releases
        .map((rel, i) => ({ path: `releases/${rel}`, header: releaseHeaders[i]!, type: 'release', label: rel }))
        .filter(b => b.header != null);
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
            .map((week, i) => ({ path: week, header: weekHeaders[i]!, type: 'week', label: week }))
            .filter(b => b.header != null);
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
