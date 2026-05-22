// Refined analysis: MAD + window 20 + dedup by (app,metric) keeping most extreme rowKey
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

interface SdkInfo { sdkVersion: string;[k: string]: unknown; }
interface ViewHeader { columns?: SdkInfo[]; apps?: Record<string, string[]>; }
interface ColumnRef { weekKey: string; colIndex: number; column: SdkInfo; }

const HIGHER_IS_BETTER = new Set([
    'js-interop-ops', 'json-parse-ops', 'exception-ops',
    'counter-per-second',
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
    return median(arr.map(v => Math.abs(v - med)));
}

function madSigma(value: number, windowValues: number[]): number {
    const med = median(windowValues);
    const m = mad(windowValues);
    if (m === 0) return value !== med ? Infinity : 0;
    return Math.abs(value - med) / (m * 1.4826);
}

const WINDOW = 20;

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

type Hit = { app: string; metric: string; mtype: string; rowKey: string; sigma: number; deltaPct: number; reg: boolean; buildIdx: number; madZero: boolean };

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

    const numBuilds = allColumns.length - WINDOW;
    console.log(`Columns: ${allColumns.length}, Window: ${WINDOW}, Builds to analyze: ${numBuilds}`);

    // Collect ALL hits
    const allHits: Hit[] = [];
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

                    const m = mad(windowVals);
                    const sigma = madSigma(curVal, windowVals);
                    if (!isFinite(sigma) && sigma !== Infinity) continue;

                    const deltaPct = prevVal !== 0 ? ((curVal - prevVal) / prevVal) * 100 : 0;
                    const reg = isRegression(metric, deltaPct);
                    const mtype = metricType(metric);
                    allHits.push({ app, metric, mtype, rowKey, sigma, deltaPct, reg, buildIdx: ci, madZero: m === 0 });
                }
            }
        }
    }

    console.log(`Total raw hits: ${allHits.length}`);
    const madZeroCount = allHits.filter(h => h.madZero).length;
    const infSigma = allHits.filter(h => h.sigma === Infinity).length;
    console.log(`MAD=0: ${madZeroCount} (${(madZeroCount / allHits.length * 100).toFixed(1)}%), Infinite σ: ${infSigma}`);

    // DEDUP: per build, per (app, metric), keep only the rowKey with highest |sigma|
    const dedupHits: Hit[] = [];
    for (let ci = WINDOW; ci < allColumns.length; ci++) {
        const buildHits = allHits.filter(h => h.buildIdx === ci);
        const byAppMetric = new Map<string, Hit>();
        for (const h of buildHits) {
            const key = `${h.app}/${h.metric}`;
            const existing = byAppMetric.get(key);
            if (!existing || h.sigma > existing.sigma) byAppMetric.set(key, h);
        }
        dedupHits.push(...byAppMetric.values());
    }

    console.log(`After dedup (best per app/metric/build): ${dedupHits.length}`);

    const buildsPerWeek = numBuilds / weekKeys.length;
    const types = [...new Set(dedupHits.map(h => h.mtype))].sort();

    console.log(`\n=== DEDUPED: PER METRIC-TYPE SIGMA DISTRIBUTIONS ===`);
    for (const mtype of types) {
        const th = dedupHits.filter(h => h.mtype === mtype);
        const regs = th.filter(h => h.reg);
        const imps = th.filter(h => !h.reg);
        console.log(`\n--- ${mtype} (${th.length} deduped, ${regs.length} reg, ${imps.length} imp) ---`);

        const thresholds = [3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 30, 50, 100, Infinity];
        console.log(`  ${'σ'.padStart(6)} | ${'Reg/bld'.padStart(8)} | ${'Imp/bld'.padStart(8)} | ${'Reg/wk'.padStart(7)} | ${'Imp/wk'.padStart(7)}`);
        for (const t of thresholds) {
            const label = isFinite(t) ? t.toString() : '∞ only';
            const regRate = regs.filter(h => (isFinite(t) ? h.sigma > t : h.sigma === Infinity)).length / numBuilds;
            const impRate = imps.filter(h => (isFinite(t) ? h.sigma > t : h.sigma === Infinity)).length / numBuilds;
            console.log(`  ${label.padStart(6)} | ${regRate.toFixed(2).padStart(8)} | ${impRate.toFixed(2).padStart(8)} | ${(regRate * buildsPerWeek).toFixed(1).padStart(7)} | ${(impRate * buildsPerWeek).toFixed(1).padStart(7)}`);
        }
    }

    // Now find thresholds: target 9 reg + 3 imp per WEEK = 1.23 reg + 0.41 imp per BUILD
    const targetRegPerBuild = 9 / buildsPerWeek;
    const targetImpPerBuild = 3 / buildsPerWeek;
    console.log(`\nTarget per build: ${targetRegPerBuild.toFixed(3)} reg, ${targetImpPerBuild.toFixed(3)} imp`);
    console.log(`Target per week: 9 reg, 3 imp`);

    // Strategy: allocate budget per type proportionally to entry count, then find thresholds
    const sigmaRange = [3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30, 50, 100];

    // Try proportional allocation
    const totalEntries = dedupHits.length;
    const typeWeights = new Map<string, number>();
    for (const t of types) typeWeights.set(t, dedupHits.filter(h => h.mtype === t).length / totalEntries);

    console.log(`\n=== PROPORTIONAL THRESHOLDS (deduped) ===`);
    const propConfigs = new Map<string, { regSigma: number; impSigma: number; regRate: number; impRate: number }>();
    let totR = 0, totI = 0;
    for (const mtype of types) {
        const th = dedupHits.filter(h => h.mtype === mtype);
        const regs = th.filter(h => h.reg);
        const imps = th.filter(h => !h.reg);
        const w = typeWeights.get(mtype)!;
        const tReg = targetRegPerBuild * w;
        const tImp = targetImpPerBuild * w;

        let bestDist = Infinity, best = { regSigma: 100, impSigma: 100, regRate: 0, impRate: 0 };
        for (const rs of sigmaRange) {
            for (const is_ of sigmaRange) {
                const rr = regs.filter(h => h.sigma > rs).length / numBuilds;
                const ir = imps.filter(h => h.sigma > is_).length / numBuilds;
                const d = (rr - tReg) ** 2 + (ir - tImp) ** 2;
                if (d < bestDist) { bestDist = d; best = { regSigma: rs, impSigma: is_, regRate: rr, impRate: ir }; }
            }
        }
        propConfigs.set(mtype, best);
        totR += best.regRate;
        totI += best.impRate;
    }

    console.log(`${'Type'.padEnd(16)} | ${'RegΣ'.padStart(5)} | ${'ImpΣ'.padStart(5)} | ${'Reg/wk'.padStart(7)} | ${'Imp/wk'.padStart(7)}`);
    console.log('-'.repeat(62));
    for (const mtype of types) {
        const c = propConfigs.get(mtype)!;
        console.log(`${mtype.padEnd(16)} | ${c.regSigma.toString().padStart(5)} | ${c.impSigma.toString().padStart(5)} | ${(c.regRate * buildsPerWeek).toFixed(1).padStart(7)} | ${(c.impRate * buildsPerWeek).toFixed(1).padStart(7)}`);
    }
    console.log('-'.repeat(62));
    console.log(`${'TOTAL'.padEnd(16)} | ${' '.padStart(5)} | ${' '.padStart(5)} | ${(totR * buildsPerWeek).toFixed(1).padStart(7)} | ${(totI * buildsPerWeek).toFixed(1).padStart(7)}`);

    // Simulate weekly totals with proportional config
    console.log(`\n=== WEEKLY SIMULATION (proportional, deduped) ===`);
    const weeklyAgg = new Map<string, { reg: number; imp: number; builds: number }>();
    for (let ci = WINDOW; ci < allColumns.length; ci++) {
        const buildDedup = dedupHits.filter(h => h.buildIdx === ci);
        let reg = 0, imp = 0;
        for (const h of buildDedup) {
            const cfg = propConfigs.get(h.mtype)!;
            if (h.sigma > (h.reg ? cfg.regSigma : cfg.impSigma)) {
                if (h.reg) reg++; else imp++;
            }
        }
        const week = allColumns[ci].weekKey;
        if (!weeklyAgg.has(week)) weeklyAgg.set(week, { reg: 0, imp: 0, builds: 0 });
        const w = weeklyAgg.get(week)!;
        w.reg += reg; w.imp += imp; w.builds++;
    }
    console.log(`${'Week'.padEnd(12)} | ${'Builds'.padStart(7)} | ${'Reg'.padStart(5)} | ${'Imp'.padStart(5)} | ${'Total'.padStart(6)}`);
    for (const [week, agg] of [...weeklyAgg.entries()].sort()) {
        console.log(`${week.padEnd(12)} | ${agg.builds.toString().padStart(7)} | ${agg.reg.toString().padStart(5)} | ${agg.imp.toString().padStart(5)} | ${(agg.reg + agg.imp).toString().padStart(6)}`);
    }

    // Also try: manually tuned - look at the data and pick reasonable thresholds
    // For size: MAD is often 0 (deterministic), any change is real → use σ=Infinity check (flag only when MAD>0)
    // Actually let's separate: what fraction of flagged hits have MAD=0?
    console.log(`\n=== MAD=0 BREAKDOWN PER TYPE (deduped, sigma=Infinity entries) ===`);
    for (const mtype of types) {
        const th = dedupHits.filter(h => h.mtype === mtype);
        const madZero = th.filter(h => h.madZero);
        const infReg = madZero.filter(h => h.reg).length;
        const infImp = madZero.filter(h => !h.reg).length;
        console.log(`  ${mtype.padEnd(16)}: ${madZero.length}/${th.length} MAD=0 (${infReg} reg, ${infImp} imp) = ${(infReg / numBuilds * buildsPerWeek).toFixed(1)} reg/wk, ${(infImp / numBuilds * buildsPerWeek).toFixed(1)} imp/wk`);
    }

    // Separate strategy for MAD=0 vs MAD>0 entries
    console.log(`\n=== SPLIT: MAD>0 entries only (where sigma is finite and meaningful) ===`);
    const finiteHits = dedupHits.filter(h => !h.madZero);
    for (const mtype of types) {
        const th = finiteHits.filter(h => h.mtype === mtype);
        const regs = th.filter(h => h.reg);
        const imps = th.filter(h => !h.reg);
        if (th.length === 0) continue;
        console.log(`\n--- ${mtype} (MAD>0: ${th.length}, ${regs.length} reg, ${imps.length} imp) ---`);
        const thresholds = [3, 5, 7, 10, 15, 20];
        console.log(`  ${'σ'.padStart(4)} | ${'Reg/wk'.padStart(7)} | ${'Imp/wk'.padStart(7)}`);
        for (const t of thresholds) {
            const rr = regs.filter(h => h.sigma > t).length / numBuilds * buildsPerWeek;
            const ir = imps.filter(h => h.sigma > t).length / numBuilds * buildsPerWeek;
            console.log(`  ${t.toString().padStart(3)} | ${rr.toFixed(1).padStart(7)} | ${ir.toFixed(1).padStart(7)}`);
        }
    }

    // For MAD=0: use min |deltaPct| threshold instead of sigma
    console.log(`\n=== MAD=0 entries: delta% distribution ===`);
    const madZeroHits = dedupHits.filter(h => h.madZero);
    for (const mtype of types) {
        const th = madZeroHits.filter(h => h.mtype === mtype);
        if (th.length === 0) continue;
        const regs = th.filter(h => h.reg);
        const imps = th.filter(h => !h.reg);
        console.log(`\n--- ${mtype} (MAD=0: ${th.length}, ${regs.length} reg, ${imps.length} imp) ---`);
        const pctThresholds = [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10];
        console.log(`  ${'|Δ%|>'.padStart(8)} | ${'Reg/wk'.padStart(7)} | ${'Imp/wk'.padStart(7)}`);
        for (const t of pctThresholds) {
            const rr = regs.filter(h => Math.abs(h.deltaPct) > t).length / numBuilds * buildsPerWeek;
            const ir = imps.filter(h => Math.abs(h.deltaPct) > t).length / numBuilds * buildsPerWeek;
            console.log(`  ${(t + '%').padStart(8)} | ${rr.toFixed(1).padStart(7)} | ${ir.toFixed(1).padStart(7)}`);
        }
    }
}

main().catch(e => { console.error(e); process.exit(1); });
