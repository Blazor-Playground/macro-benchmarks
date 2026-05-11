// Analyze delta noise: sigma distributions, threshold comparison, window impact
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

interface DeltaEntry {
    app: string; metric: string; rowKey: string;
    sigma: number; significant: boolean; direction: string;
    deltaPct: number | null;
}
interface DeltaReport {
    meta: { sdkVersion: string; benchmarkDateTime: string };
    entries: DeltaEntry[];
    summary: { total: number; significant: number; regressions: number; improvements: number };
}

async function main() {
    const deltaDir = join(import.meta.dirname!, '..', '..', '..', 'gh-pages', 'data', 'views', 'delta');
    const files = (await readdir(deltaDir)).filter(f => f.startsWith('delta-') && f.endsWith('.json'));

    const thresholds = [3, 4, 5, 6, 7, 8, 10];
    const allSigmas: number[] = [];
    const perReport: { sdk: string; date: string; week: string; bySigma: Map<number, { reg: number; imp: number }> }[] = [];

    for (const file of files) {
        const report: DeltaReport = JSON.parse(await readFile(join(deltaDir, file), 'utf-8'));
        const sdk = report.meta.sdkVersion;
        const date = report.meta.benchmarkDateTime || '';
        const week = date.slice(0, 10); // YYYY-MM-DD → approximate week

        const bySigma = new Map<number, { reg: number; imp: number }>();
        for (const t of thresholds) bySigma.set(t, { reg: 0, imp: 0 });

        for (const e of report.entries) {
            allSigmas.push(e.sigma);
            for (const t of thresholds) {
                if (e.sigma > t) {
                    const bucket = bySigma.get(t)!;
                    if (e.direction === 'regression') bucket.reg++;
                    else if (e.direction === 'improvement') bucket.imp++;
                }
            }
        }

        perReport.push({ sdk, date, week, bySigma });
    }

    // Overall sigma distribution
    allSigmas.sort((a, b) => a - b);
    const total = allSigmas.length;
    console.log(`\n=== SIGMA DISTRIBUTION (${total} total entries across ${files.length} reports) ===`);
    for (const t of thresholds) {
        const above = allSigmas.filter(s => s > t).length;
        console.log(`  σ > ${t}: ${above} entries (${(above / total * 100).toFixed(2)}%)`);
    }

    // Percentiles
    const pcts = [50, 75, 90, 95, 99, 99.5, 99.9];
    console.log(`\n=== SIGMA PERCENTILES ===`);
    for (const p of pcts) {
        const idx = Math.floor(total * p / 100);
        console.log(`  P${p}: σ = ${allSigmas[idx]?.toFixed(2)}`);
    }

    // Per-report averages by threshold
    console.log(`\n=== AVERAGE SIGNIFICANT ENTRIES PER BUILD ===`);
    console.log(`${'σ'.padStart(4)} | ${'Reg'.padStart(6)} | ${'Imp'.padStart(6)} | ${'Total'.padStart(6)}`);
    console.log(`${'----'.padStart(4)}-+-${'------'.padStart(6)}-+-${'------'.padStart(6)}-+-${'------'.padStart(6)}`);
    for (const t of thresholds) {
        const avgReg = perReport.reduce((s, r) => s + r.bySigma.get(t)!.reg, 0) / perReport.length;
        const avgImp = perReport.reduce((s, r) => s + r.bySigma.get(t)!.imp, 0) / perReport.length;
        console.log(`  ${t.toString().padStart(2)} | ${avgReg.toFixed(1).padStart(6)} | ${avgImp.toFixed(1).padStart(6)} | ${(avgReg + avgImp).toFixed(1).padStart(6)}`);
    }

    // Per-report table at various thresholds
    console.log(`\n=== PER BUILD: σ>3 vs σ>5 vs σ>7 ===`);
    console.log(`${'SDK'.padEnd(45)} | ${'σ>3'.padStart(8)} | ${'σ>5'.padStart(8)} | ${'σ>7'.padStart(8)}`);
    for (const r of perReport) {
        const s3 = r.bySigma.get(3)!; const t3 = s3.reg + s3.imp;
        const s5 = r.bySigma.get(5)!; const t5 = s5.reg + s5.imp;
        const s7 = r.bySigma.get(7)!; const t7 = s7.reg + s7.imp;
        const shortSdk = r.sdk.length > 44 ? r.sdk.slice(0, 44) : r.sdk;
        console.log(`${shortSdk.padEnd(45)} | ${(t3 + '').padStart(3)}(${s3.reg}R) | ${(t5 + '').padStart(3)}(${s5.reg}R) | ${(t7 + '').padStart(3)}(${s7.reg}R)`);
    }

    // Top noisy metrics (most often flagged at σ>3)
    const metricNoise = new Map<string, number>();
    for (const file of files) {
        const report: DeltaReport = JSON.parse(await readFile(join(deltaDir, file), 'utf-8'));
        for (const e of report.entries) {
            if (e.sigma > 3) {
                const key = `${e.app}/${e.metric}/${e.rowKey}`;
                metricNoise.set(key, (metricNoise.get(key) || 0) + 1);
            }
        }
    }
    const sorted = [...metricNoise.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`\n=== TOP 20 NOISIEST METRICS (flagged σ>3 most often across ${files.length} builds) ===`);
    for (const [key, count] of sorted.slice(0, 20)) {
        console.log(`  ${count.toString().padStart(3)}x  ${key}`);
    }

    // What % of "significant" are same metrics repeatedly?
    const totalFlagged = [...metricNoise.values()].reduce((a, b) => a + b, 0);
    const repeaters = sorted.filter(([, c]) => c >= 10);
    const repeaterFlagged = repeaters.reduce((s, [, c]) => s + c, 0);
    console.log(`\n=== NOISE CONCENTRATION ===`);
    console.log(`  ${repeaters.length} metrics flagged ≥10 times account for ${repeaterFlagged}/${totalFlagged} flags (${(repeaterFlagged / totalFlagged * 100).toFixed(1)}%)`);
}

main().catch(e => { console.error(e); process.exit(1); });
