// Analyze per-metric noise with MAD, window 20, asymmetric thresholds.
// Goal: find per-metric-type thresholds yielding ~9 regressions + ~3 improvements per build.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

interface SdkInfo { sdkVersion: string; runtimeGitHash: string;[k: string]: unknown; }
interface ViewHeader { columns?: SdkInfo[]; apps?: Record<string, string[]>; }
interface ColumnRef { weekKey: string; colIndex: number; column: SdkInfo; }

const HIGHER_IS_BETTER = new Set([
    'js-interop-ops', 'json-parse-ops', 'exception-ops',
    'blazor-js-to-cs-number', 'blazor-js-to-cs-string', 'blazor-js-to-cs-json',
    'blazor-cs-to-js-number', 'blazor-cs-to-js-string', 'blazor-cs-to-js-json',
]);

function isRegression(metric: string, deltaPct: number): boolean {
    if (deltaPct === 0) return false;
    return HIGHER_IS_BETTER.has(metric) ? deltaPct < 0 : deltaPct > 0;
}

function median(arr: number[]): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mad(arr: number[]): number {
    const med = median(arr);
    const deviations = arr.map(v => Math.abs(v - med));
    return median(deviations);
}

// MAD-based sigma: |x - median| / (MAD * 1.4826)
// 1.4826 is the consistency constant for normal distributions
function madSigma(value: number, windowValues: number[]): number {
    const med = median(windowValues);
    const m = mad(windowValues);
    if (m === 0) return value !== med ? Infinity : 0;
    return Math.abs(value - med) / (m * 1.4826);
}

const WINDOW = 20;

// Metric type categories
function metricType(metric: string): string {
    if (metric.startsWith('compile-time')) return 'compile-time';
    if (metric.startsWith('disk-size') || metric.startsWith('download-size')) return 'size';
    if (metric.includes('-ops') || metric.includes('-per-second')) return 'throughput';
    if (metric.startsWith('time-to') || metric.startsWith('memory')) return 'timing-memory';
    return 'other';
}

const dataCache = new Map<string, Record<string, (number | null)[]> | null>();
async function loadMetricData(viewsDir: string, weekKey: string, app: string, metric: string) {
    const key = `${weekKey}/${app}_${metric}`;
    if (dataCache.has(key)) return dataCache.get(key)!;
    const filePath = join(viewsDir, weekKey, `${app}_${metric}.json`);
    if (!existsSync(filePath)) { dataCache.set(key, null); return null; }
    const data = JSON.parse(await readFile(filePath, 'utf-8'));
    dataCache.set(key, data);
    return data;
}

async function main() {
    const repoRoot = join(import.meta.dirname!, '..', '..', '..');
    const viewsDir = join(repoRoot, 'gh-pages', 'data', 'views');

    const entries = await readdir(viewsDir, { withFileTypes: true });
    const weekKeys = entries.filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
        .map(e => e.name).sort().reverse();

    const headers = new Map<string, ViewHeader>();
    for (const week of weekKeys) {
        const hp = join(viewsDir, week, 'header.json');
        if (existsSync(hp)) headers.set(week, JSON.parse(await readFile(hp, 'utf-8')));
    }

    const allColumns: ColumnRef[] = [];
    for (const week of [...weekKeys].reverse()) {
        const h = headers.get(week);
        if (!h?.columns) continue;
        for (let i = 0; i < h.columns.length; i++)
            allColumns.push({ weekKey: week, colIndex: i, column: h.columns[i] });
    }

    console.log(`Columns: ${allColumns.length}, Window: ${WINDOW}`);
    if (allColumns.length < WINDOW + 1) { console.log('Not enough columns'); return; }

    // Collect all (metricType, sigma, isRegression) tuples
    type Hit = { mtype: string; metric: string; sigma: number; reg: boolean; buildIdx: number };
    const hits: Hit[] = [];

    for (let ci = WINDOW; ci < allColumns.length; ci++) {
        const cur = allColumns[ci];
        const prev = allColumns[ci - 1];
        const windowRefs = allColumns.slice(ci - WINDOW, ci);
        const curHeader = headers.get(cur.weekKey)!;

        for (const [app, metrics] of Object.entries(curHeader.apps || {})) {
            for (const metric of metrics) {
                const curData = await loadMetricData(viewsDir, cur.weekKey, app, metric);
                if (!curData) continue;
                const prevData = await loadMetricData(viewsDir, prev.weekKey, app, metric);

                const windowDataByWeek = new Map<string, Record<string, (number | null)[]>>();
                for (const week of new Set(windowRefs.map(r => r.weekKey))) {
                    const d = await loadMetricData(viewsDir, week, app, metric);
                    if (d) windowDataByWeek.set(week, d);
                }

                for (const [rowKey, values] of Object.entries(curData)) {
                    const curVal = values[cur.colIndex];
                    if (curVal == null) continue;
                    const prevVal = prevData?.[rowKey]?.[prev.colIndex] ?? null;
                    if (prevVal == null) continue;

                    const windowVals: number[] = [];
                    for (const ref of windowRefs) {
                        const wd = windowDataByWeek.get(ref.weekKey);
                        const v = wd?.[rowKey]?.[ref.colIndex];
                        if (v != null) windowVals.push(v);
                    }
                    if (windowVals.length < WINDOW) continue;

                    const sigma = madSigma(curVal, windowVals);
                    if (!isFinite(sigma)) continue;

                    const deltaPct = prevVal !== 0 ? ((curVal - prevVal) / prevVal) * 100 : 0;
                    const reg = isRegression(metric, deltaPct);
                    const mtype = metricType(metric);
                    hits.push({ mtype, metric, sigma, reg, buildIdx: ci });
                }
            }
        }
    }

    const numBuilds = allColumns.length - WINDOW;
    console.log(`\nTotal hits: ${hits.length} across ${numBuilds} builds`);

    // Group by metric type
    const types = [...new Set(hits.map(h => h.mtype))].sort();

    // For each metric type, find threshold that yields target rate
    // Target: 9 regressions + 3 improvements per build total
    // Distribute proportionally by metric type count
    console.log(`\n=== PER METRIC-TYPE SIGMA DISTRIBUTIONS (MAD-based, window=${WINDOW}) ===`);
    for (const mtype of types) {
        const typeHits = hits.filter(h => h.mtype === mtype);
        const regs = typeHits.filter(h => h.reg);
        const imps = typeHits.filter(h => !h.reg);
        console.log(`\n--- ${mtype} (${typeHits.length} entries, ${regs.length} reg, ${imps.length} imp) ---`);

        const thresholds = [3, 4, 5, 6, 7, 8, 10, 12, 15, 20];
        console.log(`  ${'σ'.padStart(4)} | ${'Reg/build'.padStart(10)} | ${'Imp/build'.padStart(10)} | ${'Total/build'.padStart(12)}`);
        for (const t of thresholds) {
            const regAbove = regs.filter(h => h.sigma > t).length / numBuilds;
            const impAbove = imps.filter(h => h.sigma > t).length / numBuilds;
            console.log(`  ${t.toString().padStart(3)} | ${regAbove.toFixed(2).padStart(10)} | ${impAbove.toFixed(2).padStart(10)} | ${(regAbove + impAbove).toFixed(2).padStart(12)}`);
        }
    }

    // Now find asymmetric thresholds: for each type, find (regσ, impσ) that hits target
    // Split target: ~9 reg + ~3 imp across ~10 builds/week ≈ 0.9 reg/build + 0.3 imp/build
    // But we have ~83 builds over ~10 weeks ≈ ~8 builds/week
    // So per build: 9/8 ≈ 1.1 reg, 3/8 ≈ 0.4 imp
    const buildsPerWeek = numBuilds / weekKeys.length;
    const targetRegPerBuild = 9 / buildsPerWeek;
    const targetImpPerBuild = 3 / buildsPerWeek;
    console.log(`\n=== TARGET CALIBRATION ===`);
    console.log(`Builds/week: ${buildsPerWeek.toFixed(1)}`);
    console.log(`Target per build: ${targetRegPerBuild.toFixed(2)} reg, ${targetImpPerBuild.toFixed(2)} imp`);

    // Weight distribution by type (based on how many entries each type has)
    const typeCounts = new Map<string, number>();
    for (const t of types) typeCounts.set(t, hits.filter(h => h.mtype === t).length);
    const totalCount = hits.length;

    console.log(`\n=== FINDING ASYMMETRIC THRESHOLDS PER TYPE ===`);
    console.log(`(Target per build total: ~${targetRegPerBuild.toFixed(2)} reg + ~${targetImpPerBuild.toFixed(2)} imp)`);

    // For each type, allocate proportional targets then find thresholds
    const typeWeight = new Map<string, number>();
    for (const t of types) typeWeight.set(t, typeCounts.get(t)! / totalCount);

    // But actually, let's try equal allocation first, then proportional
    // Strategy: sweep and find best fit
    const sigmaRange = [3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30];

    interface TypeConfig { regSigma: number; impSigma: number; regRate: number; impRate: number; }
    const bestConfigs = new Map<string, TypeConfig>();

    for (const mtype of types) {
        const typeHits = hits.filter(h => h.mtype === mtype);
        const regs = typeHits.filter(h => h.reg);
        const imps = typeHits.filter(h => !h.reg);

        // Proportional target for this type
        const w = typeWeight.get(mtype)!;
        const tReg = targetRegPerBuild * w;
        const tImp = targetImpPerBuild * w;

        let bestDist = Infinity;
        let best: TypeConfig = { regSigma: 10, impSigma: 10, regRate: 0, impRate: 0 };

        for (const rs of sigmaRange) {
            for (const is_ of sigmaRange) {
                const regRate = regs.filter(h => h.sigma > rs).length / numBuilds;
                const impRate = imps.filter(h => h.sigma > is_).length / numBuilds;
                const dist = (regRate - tReg) ** 2 + (impRate - tImp) ** 2;
                if (dist < bestDist) {
                    bestDist = dist;
                    best = { regSigma: rs, impSigma: is_, regRate: regRate, impRate: impRate };
                }
            }
        }
        bestConfigs.set(mtype, best);
    }

    // Show results
    console.log(`\n${'Type'.padEnd(16)} | ${'RegΣ'.padStart(5)} | ${'ImpΣ'.padStart(5)} | ${'Reg/bld'.padStart(8)} | ${'Imp/bld'.padStart(8)} | ${'Reg/wk'.padStart(7)} | ${'Imp/wk'.padStart(7)}`);
    console.log('-'.repeat(80));
    let totalRegRate = 0, totalImpRate = 0;
    for (const mtype of types) {
        const cfg = bestConfigs.get(mtype)!;
        totalRegRate += cfg.regRate;
        totalImpRate += cfg.impRate;
        console.log(`${mtype.padEnd(16)} | ${cfg.regSigma.toString().padStart(5)} | ${cfg.impSigma.toString().padStart(5)} | ${cfg.regRate.toFixed(3).padStart(8)} | ${cfg.impRate.toFixed(3).padStart(8)} | ${(cfg.regRate * buildsPerWeek).toFixed(1).padStart(7)} | ${(cfg.impRate * buildsPerWeek).toFixed(1).padStart(7)}`);
    }
    console.log('-'.repeat(80));
    console.log(`${'TOTAL'.padEnd(16)} | ${' '.padStart(5)} | ${' '.padStart(5)} | ${totalRegRate.toFixed(3).padStart(8)} | ${totalImpRate.toFixed(3).padStart(8)} | ${(totalRegRate * buildsPerWeek).toFixed(1).padStart(7)} | ${(totalImpRate * buildsPerWeek).toFixed(1).padStart(7)}`);

    // Also try: equal per-type target (not proportional)
    console.log(`\n=== EQUAL-ALLOCATION APPROACH (equal target per type) ===`);
    const eqTargetRegPerBuild = targetRegPerBuild / types.length;
    const eqTargetImpPerBuild = targetImpPerBuild / types.length;

    let eqTotalReg = 0, eqTotalImp = 0;
    const eqConfigs = new Map<string, TypeConfig>();
    for (const mtype of types) {
        const typeHits = hits.filter(h => h.mtype === mtype);
        const regs = typeHits.filter(h => h.reg);
        const imps = typeHits.filter(h => !h.reg);

        let bestDist = Infinity;
        let best: TypeConfig = { regSigma: 30, impSigma: 30, regRate: 0, impRate: 0 };
        for (const rs of sigmaRange) {
            for (const is_ of sigmaRange) {
                const regRate = regs.filter(h => h.sigma > rs).length / numBuilds;
                const impRate = imps.filter(h => h.sigma > is_).length / numBuilds;
                const dist = (regRate - eqTargetRegPerBuild) ** 2 + (impRate - eqTargetImpPerBuild) ** 2;
                if (dist < bestDist) { bestDist = dist; best = { regSigma: rs, impSigma: is_, regRate, impRate }; }
            }
        }
        eqConfigs.set(mtype, best);
        eqTotalReg += best.regRate;
        eqTotalImp += best.impRate;
    }

    console.log(`${'Type'.padEnd(16)} | ${'RegΣ'.padStart(5)} | ${'ImpΣ'.padStart(5)} | ${'Reg/bld'.padStart(8)} | ${'Imp/bld'.padStart(8)} | ${'Reg/wk'.padStart(7)} | ${'Imp/wk'.padStart(7)}`);
    console.log('-'.repeat(80));
    for (const mtype of types) {
        const cfg = eqConfigs.get(mtype)!;
        console.log(`${mtype.padEnd(16)} | ${cfg.regSigma.toString().padStart(5)} | ${cfg.impSigma.toString().padStart(5)} | ${cfg.regRate.toFixed(3).padStart(8)} | ${cfg.impRate.toFixed(3).padStart(8)} | ${(cfg.regRate * buildsPerWeek).toFixed(1).padStart(7)} | ${(cfg.impRate * buildsPerWeek).toFixed(1).padStart(7)}`);
    }
    console.log('-'.repeat(80));
    console.log(`${'TOTAL'.padEnd(16)} | ${' '.padStart(5)} | ${' '.padStart(5)} | ${eqTotalReg.toFixed(3).padStart(8)} | ${eqTotalImp.toFixed(3).padStart(8)} | ${(eqTotalReg * buildsPerWeek).toFixed(1).padStart(7)} | ${(eqTotalImp * buildsPerWeek).toFixed(1).padStart(7)}`);

    // Validate: simulate per-build counts with the proportional config
    console.log(`\n=== SIMULATION: per-build counts with PROPORTIONAL config ===`);
    const buildCounts: { sdk: string; reg: number; imp: number }[] = [];
    for (let ci = WINDOW; ci < allColumns.length; ci++) {
        const buildHits = hits.filter(h => h.buildIdx === ci);
        let reg = 0, imp = 0;
        for (const h of buildHits) {
            const cfg = bestConfigs.get(h.mtype)!;
            const threshold = h.reg ? cfg.regSigma : cfg.impSigma;
            if (h.sigma > threshold) {
                if (h.reg) reg++; else imp++;
            }
        }
        buildCounts.push({ sdk: allColumns[ci].column.sdkVersion, reg, imp });
    }

    // Show weekly aggregates
    const weeklyAgg = new Map<string, { reg: number; imp: number; builds: number }>();
    for (let ci = WINDOW; ci < allColumns.length; ci++) {
        const bc = buildCounts[ci - WINDOW];
        const week = allColumns[ci].weekKey;
        if (!weeklyAgg.has(week)) weeklyAgg.set(week, { reg: 0, imp: 0, builds: 0 });
        const w = weeklyAgg.get(week)!;
        w.reg += bc.reg; w.imp += bc.imp; w.builds++;
    }
    console.log(`${'Week'.padEnd(12)} | ${'Builds'.padStart(7)} | ${'Reg'.padStart(5)} | ${'Imp'.padStart(5)} | ${'Total'.padStart(6)}`);
    for (const [week, agg] of [...weeklyAgg.entries()].sort()) {
        console.log(`${week.padEnd(12)} | ${agg.builds.toString().padStart(7)} | ${agg.reg.toString().padStart(5)} | ${agg.imp.toString().padStart(5)} | ${(agg.reg + agg.imp).toString().padStart(6)}`);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
