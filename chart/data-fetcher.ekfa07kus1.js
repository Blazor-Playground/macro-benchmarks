// HTTP fetch with caching, bucket collection, and data prefetching
const cache = {};
export async function fetchJson(url) {
    if (cache[url])
        return cache[url];
    const resp = await fetch(url);
    if (!resp.ok)
        return null;
    const data = await resp.json();
    cache[url] = data;
    return data;
}
export function getCached(url) {
    return cache[url] || null;
}
export async function collectBuckets(dataBaseUrl, viewIndex, showDailyReleases) {
    const releaseHeaders = await Promise.all(viewIndex.releases.map(rel => fetchJson(`${dataBaseUrl}/releases/${rel}/header.json`)));
    const releaseBuckets = viewIndex.releases
        .map((rel, i) => ({ path: `releases/${rel}`, header: releaseHeaders[i], type: 'release', label: rel }))
        .filter(b => b.header != null);
    // Sort release buckets by major version number (ascending: net8, net9, net10)
    releaseBuckets.sort((a, b) => {
        const numA = parseInt(a.label.replace('net', ''), 10) || 0;
        const numB = parseInt(b.label.replace('net', ''), 10) || 0;
        return numA - numB;
    });
    let weekBuckets = [];
    if (showDailyReleases) {
        const weekHeaders = await Promise.all(viewIndex.weeks.map(week => fetchJson(`${dataBaseUrl}/${week}/header.json`)));
        weekBuckets = viewIndex.weeks
            .map((week, i) => ({ path: week, header: weekHeaders[i], type: 'week', label: week }))
            .filter(b => b.header != null);
    }
    return { releaseBuckets, weekBuckets };
}
export async function prefetchMetricData(dataBaseUrl, app, metrics, releaseBuckets, weekBuckets, showReleases, showDailyReleases) {
    const urls = [];
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
