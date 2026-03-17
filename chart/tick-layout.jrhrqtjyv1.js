// Single authority for all x-axis positioning, dividers, and tick labels
import { RELEASE_TICK_MS, ZONE_GAP_MS, assert } from './constants.js';
/** Extract the build revision from an SDK version string.
 *  "11.0.100-preview.3.26161.119" → 119
 *  "10.0.100" → 0  (GA, no prerelease suffix)
 */
function extractRevision(sdkVersion) {
    const m = sdkVersion.match(/-\w+\.\d+\.\d+\.(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
}
export function computeTickLayout(releaseBuckets, weekBuckets, showReleases, showDaily) {
    const releasePositions = new Map();
    const dailyPositions = new Map();
    const tickMap = new Map();
    // ── Phase 1: Compute daily x positions (real dates + revision offset) ────
    let dailyMin = Infinity;
    let dailyMax = -Infinity;
    if (showDaily) {
        for (const bucket of weekBuckets) {
            const positions = [];
            for (const col of bucket.header.columns) {
                const base = Date.parse(col.releaseDate);
                assert(!isNaN(base), `invalid releaseDate '${col.releaseDate}' in ${bucket.path}`);
                const revision = extractRevision(col.sdkVersion);
                const x = base + revision;
                positions.push(x);
                tickMap.set(x, col.sdkVersion);
                if (x < dailyMin)
                    dailyMin = x;
                if (x > dailyMax)
                    dailyMax = x;
            }
            dailyPositions.set(bucket.path, positions);
        }
    }
    const hasDailyData = dailyMin < Infinity;
    const dailySpan = hasDailyData ? Math.max(dailyMax - dailyMin, 1) : 0;
    // ── Phase 2: Compute release x positions (synthetic, evenly spaced) ──────
    const totalReleaseCols = showReleases
        ? releaseBuckets.reduce((sum, b) => sum + b.header.columns.length, 0)
        : 0;
    if (showReleases && totalReleaseCols > 0) {
        let releaseInterval;
        let releaseStart;
        if (hasDailyData) {
            // 50/50 split: release zone gets same span as daily zone
            releaseInterval = dailySpan / totalReleaseCols;
            releaseStart = dailyMin - ZONE_GAP_MS - dailySpan;
        }
        else {
            // Release-only: spread across a reasonable range
            releaseInterval = RELEASE_TICK_MS;
            const totalSpan = totalReleaseCols * releaseInterval;
            releaseStart = Date.now() - totalSpan;
        }
        let cursor = releaseStart;
        for (const bucket of releaseBuckets) {
            const positions = [];
            for (const col of bucket.header.columns) {
                positions.push(cursor);
                tickMap.set(cursor, col.sdkVersion);
                cursor += releaseInterval;
            }
            releasePositions.set(bucket.label, positions);
        }
    }
    // ── Phase 3: Compute divider positions ───────────────────────────────────
    const dividerDates = [];
    if (showReleases && releaseBuckets.length > 0) {
        // Track per-major ranges to find boundaries
        const majorRanges = new Map();
        for (const bucket of releaseBuckets) {
            const positions = releasePositions.get(bucket.label);
            if (!positions || positions.length === 0)
                continue;
            const major = bucket.header.columns[0].major;
            const bucketMin = positions[0];
            const bucketMax = positions[positions.length - 1];
            const range = majorRanges.get(major);
            if (!range) {
                majorRanges.set(major, { min: bucketMin, max: bucketMax });
            }
            else {
                if (bucketMin < range.min)
                    range.min = bucketMin;
                if (bucketMax > range.max)
                    range.max = bucketMax;
            }
        }
        const sortedMajors = [...majorRanges.entries()].sort((a, b) => a[0] - b[0]);
        // Dividers between major version groups
        for (let i = 0; i < sortedMajors.length - 1; i++) {
            const prevMax = sortedMajors[i][1].max;
            const nextMin = sortedMajors[i + 1][1].min;
            dividerDates.push((prevMax + nextMin) / 2);
        }
        // Divider between last release and first daily
        if (hasDailyData && sortedMajors.length > 0) {
            const lastReleaseMax = sortedMajors[sortedMajors.length - 1][1].max;
            dividerDates.push((lastReleaseMax + dailyMin) / 2);
        }
    }
    return { releasePositions, dailyPositions, dividerDates, tickMap };
}
