// Compute synthetic tick positions for release columns on the time axis

import { RELEASE_TICK_MS, RELEASE_MAJOR_GAP_MS, RELEASE_DAILY_GAP_MS } from './constants.mjs';

export function computeReleaseTickMap(releaseBuckets, weekBuckets) {
    const releaseTickMap = new Map();

    // Find earliest daily build date from week bucket headers
    let earliestDailyMs = null;
    for (const wb of weekBuckets) {
        for (const col of (wb.header.columns || [])) {
            if (col.runtimeCommitDateTime) {
                const ms = new Date(col.runtimeCommitDateTime).getTime();
                if (!earliestDailyMs || ms < earliestDailyMs) earliestDailyMs = ms;
            }
        }
    }

    // Count total release columns and compute sequential tick positions
    const bucketColCounts = releaseBuckets.map(b => (b.header.columns || []).length);
    const totalCols = bucketColCounts.reduce((a, b) => a + b, 0);
    const totalGaps = Math.max(0, releaseBuckets.length - 1);
    const totalSpanMs = totalCols * RELEASE_TICK_MS + totalGaps * RELEASE_MAJOR_GAP_MS;

    // Anchor: place last release tick at (earliestDaily - gap), or use first bucket's natural date
    let startMs;
    if (earliestDailyMs) {
        startMs = earliestDailyMs - RELEASE_DAILY_GAP_MS - totalSpanMs;
    } else if (releaseBuckets.length > 0) {
        const firstCol = releaseBuckets[0].header.columns?.[0];
        startMs = firstCol?.runtimeCommitDateTime
            ? new Date(firstCol.runtimeCommitDateTime).getTime() : Date.now() - totalSpanMs;
    } else {
        startMs = Date.now();
    }

    let cursor = startMs;
    for (let bi = 0; bi < releaseBuckets.length; bi++) {
        const cols = releaseBuckets[bi].header.columns || [];
        const ticks = cols.map(() => {
            const t = cursor;
            cursor += RELEASE_TICK_MS;
            return t;
        });
        releaseTickMap.set(releaseBuckets[bi].label, ticks);
        // Add gap before next major (but not after the last one)
        if (bi < releaseBuckets.length - 1) {
            cursor += RELEASE_MAJOR_GAP_MS;
        }
    }

    return releaseTickMap;
}
