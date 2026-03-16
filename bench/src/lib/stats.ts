// ── Descriptive Statistics ────────────────────────────────────────────────────

export interface SampleStats {
    n: number;
    median: number;
    mean: number;
    variance: number;
    stddev: number;
    /** Standard error of the mean */
    se: number;
    /** Coefficient of variation (%) */
    cv: number;
    /** Lower bound of 95% confidence interval */
    ci95lo: number;
    /** Upper bound of 95% confidence interval */
    ci95hi: number;
    min: number;
    max: number;
}

/** Compute descriptive statistics + 95% CI for a set of samples. */
export function computeStats(values: number[]): SampleStats {
    const n = values.length;
    const sorted = [...values].sort((a, b) => a - b);
    const med = median(sorted);
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
    const stddev = Math.sqrt(variance);
    const se = stddev / Math.sqrt(n);
    const cv = mean !== 0 ? (stddev / mean) * 100 : 0;
    const t95 = n >= 30 ? 1.96 : tCritical95(n - 1);
    const ci95lo = mean - t95 * se;
    const ci95hi = mean + t95 * se;
    return {
        n, median: med, mean, variance, stddev, se, cv,
        ci95lo, ci95hi,
        min: sorted[0], max: sorted[n - 1],
    };
}

/** Format a SampleStats object as multi-line log output. */
export function formatStats(label: string, s: SampleStats): string {
    const lines = [
        `  ${label}:`,
        `    samples: ${s.n}, median: ${s.median.toFixed(1)}, mean: ${s.mean.toFixed(1)}`,
        `    stddev: ${s.stddev.toFixed(1)}, CV: ${s.cv.toFixed(2)}%, SE: ${s.se.toFixed(1)}`,
        `    95% CI: [${s.ci95lo.toFixed(1)}, ${s.ci95hi.toFixed(1)}]`,
        `    min: ${s.min.toFixed(1)}, max: ${s.max.toFixed(1)}`,
    ];
    return lines.join('\n');
}

/** Median of a pre-sorted array. */
export function median(sorted: number[]): number {
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Copy, sort, and return the median. Returns null if empty. */
export function sortedMedian(values: number[]): number | null {
    if (values.length === 0) return null;
    return median([...values].sort((a, b) => a - b));
}

/** Approximate t-critical value for 95% CI (two-tailed) for small df. */
function tCritical95(df: number): number {
    const table: Record<number, number> = {
        1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
        6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
        15: 2.131, 20: 2.086, 25: 2.060, 30: 2.042,
    };
    if (table[df]) return table[df];
    const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
    for (let i = keys.length - 1; i >= 0; i--) {
        if (keys[i] <= df) return table[keys[i]];
    }
    return 1.96;
}
