import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildContext } from '../args.js';
import { type BenchContext, type SdkInfo, saveContext } from '../context.js';
import { App, Preset, Runtime, getEnginesForApp, getProfilesForEngine, shouldSkipMeasurement } from '../enums.js';
import { verifyIntegrity } from '../lib/measure-utils.js';
import { run } from '../stages/measure.js';

interface LocalManifest {
    repoRoot: string;
    runDir: string;
    sdkDir: string;
    dotnetBin: string;
    buildLabel: string;
    runtime: 'mono' | 'coreclr';
    preset: 'no-workload' | 'aot';
    variant: 'no-workload' | 'aot' | 'composite';
    publishDir: string;
    compileTimeMs: number;
    integrity: { fileCount: number; totalBytes: number };
    sdkInfo: SdkInfo;
}

export async function validateMeasurementResults(
    resultsDir: string,
    expectedPairs: ReadonlySet<string>,
    requested: Pick<BenchContext, 'coldRuns' | 'warmRuns' | 'walkthroughRuns'>,
): Promise<void> {
    const files = (await readdir(resultsDir)).filter(file => file !== 'context.json' && file.endsWith('.json'));
    if (files.length !== expectedPairs.size || files.length === 0) {
        throw new Error('Measurement did not produce every requested browser result.');
    }
    const seen = new Set<string>();
    for (const file of files) {
        const result = JSON.parse(await readFile(join(resultsDir, file), 'utf8'));
        const pair = `${result.meta?.engine}/${result.meta?.profile}`;
        if (!expectedPairs.has(pair) || seen.has(pair)) {
            throw new Error(`Unexpected or duplicate browser result ${pair} in ${file}.`);
        }
        seen.add(pair);
        const hasWalkthrough = result.meta.engine === 'chrome' && result.meta.profile === 'desktop';
        if (hasWalkthrough && !(result.metrics?.['havit-walkthrough'] > 0)) {
            throw new Error(`Havit walkthrough failed in ${file}; retained startup data is not a valid performance comparison.`);
        }
        if (!(result.metrics?.['time-to-reach-managed-cold'] > 0) ||
            !(result.metrics?.['time-to-reach-managed-warm'] > 0)) {
            throw new Error(`Missing cold/warm startup metrics in ${file}.`);
        }
        const walkthroughRuns = requested.walkthroughRuns > 0 ? requested.walkthroughRuns :
            (requested.warmRuns > 1 ? requested.warmRuns * 4 : 1);
        if (result.samples?.['time-to-reach-managed-cold'] !== requested.coldRuns ||
            result.samples?.['time-to-reach-managed-warm'] !== requested.warmRuns ||
            (hasWalkthrough && result.samples?.['havit-walkthrough'] !== walkthroughRuns)) {
            throw new Error(`Incomplete startup/walkthrough samples in ${file}; refusing to accept a partial measurement.`);
        }
    }
}

async function main(): Promise<void> {
    const [manifestPath, ...args] = process.argv.slice(2);
    if (!manifestPath) throw new Error('Usage: tsx bench/src/scripts/measure-local-runtime.ts <manifest.json> [measure options]');
    const allowed = new Set([
        '--engine', '--profile', '--cold-runs', '--warm-runs', '--walkthrough-runs',
        '--timeout', '--retries', '--deadline-minutes', '--no-headless', '--verbose',
        '--system-chrome',
    ]);
    for (const arg of args) {
        if (arg.startsWith('--') && !allowed.has(arg.split('=')[0])) {
            throw new Error(`Not a local measurement option: ${arg}`);
        }
    }
    const manifest: LocalManifest = JSON.parse(await readFile(resolve(manifestPath), 'utf8'));
    if (!['mono', 'coreclr'].includes(manifest.runtime) || !['no-workload', 'aot'].includes(manifest.preset) ||
        !['no-workload', 'aot', 'composite'].includes(manifest.variant)) {
        throw new Error('Invalid local runtime manifest: unsupported runtime, preset, or variant.');
    }
    const runtime = manifest.runtime === 'coreclr' ? Runtime.CoreCLR : Runtime.Mono;
    const preset = manifest.preset === 'aot' ? Preset.Aot : Preset.NoWorkload;
    const ctx = await buildContext([
        '--stages', 'measure', '--app', 'havit-bootstrap', '--runtime', manifest.runtime,
        '--preset', manifest.preset, '--engine', 'chrome', '--profile', 'desktop',
        '--cold-runs', '10', '--warm-runs', '5', '--walkthrough-runs', '1',
        '--timeout', '60000', ...args.filter(arg => arg !== '--system-chrome'),
    ]);
    ctx.chromiumChannel = args.includes('--system-chrome') ? 'chrome' : undefined;
    ctx.repoRoot = manifest.repoRoot;
    ctx.sdkInfo = manifest.sdkInfo;
    ctx.sdkVersion = manifest.sdkInfo.sdkVersion;
    ctx.sdkDir = manifest.sdkDir;
    ctx.dotnetBin = manifest.dotnetBin;
    ctx.buildLabel = manifest.buildLabel;
    ctx.runId = manifest.buildLabel;
    ctx.resultsDir = join(manifest.runDir, 'results', `measurement-${Date.now()}`);
    ctx.publishDir = manifest.publishDir;
    // Local packs, not the base SDK catalog, provide R2R support.
    ctx.runtimeBuildRequired = true;
    ctx.apps = [App.HavitBootstrap];
    ctx.runtimes = [runtime];
    ctx.presets = [preset];
    ctx.dryRun = false;
    ctx.replica = manifest.variant;
    ctx.buildManifest = [{
        app: App.HavitBootstrap, runtime, preset, publishDir: manifest.publishDir,
        compileTimeMs: manifest.compileTimeMs, integrity: manifest.integrity,
    }];
    const skip = shouldSkipMeasurement(runtime, App.HavitBootstrap, preset, ctx);
    if (skip) throw new Error(`Local measurement would be skipped: ${skip}`);
    const engines = getEnginesForApp(App.HavitBootstrap, ctx.engines);
    const expectedPairs = new Set(engines.flatMap(engine =>
        getProfilesForEngine(engine, ctx.profiles).map(profile => `${engine}/${profile}`)));
    if (engines.length !== ctx.engines.length || expectedPairs.size === 0 ||
        engines.some(engine => getProfilesForEngine(engine, ctx.profiles).length === 0)) {
        throw new Error('Havit requires a browser engine and a supported profile (Chrome: desktop/mobile; Firefox: desktop).');
    }
    if (ctx.coldRuns < 1 || ctx.warmRuns < 1) throw new Error('Use at least one cold run and one warm run.');
    const integrity = await verifyIntegrity(manifest.publishDir, manifest.integrity);
    if (!integrity.valid) throw new Error('Publish output changed since manifest creation. Republish before measuring.');
    await mkdir(ctx.resultsDir, { recursive: true });
    await mkdir(join(manifest.runDir, 'logs'), { recursive: true });
    const contextPath = join(ctx.resultsDir, 'context.json');
    await saveContext(ctx, contextPath);
    const statusPath = join(manifest.runDir, 'logs', `measurement-${Date.now()}.status.json`);
    try {
        await run(ctx);
        // The legacy stage can return startup metrics after navigation failed.
        await validateMeasurementResults(ctx.resultsDir, expectedPairs, ctx);
        await writeFile(statusPath, JSON.stringify({ status: 'passed', contextPath, resultsDir: ctx.resultsDir }, null, 2));
    } catch (error) {
        await writeFile(statusPath, JSON.stringify({
            status: 'failed', contextPath, resultsDir: ctx.resultsDir,
            error: error instanceof Error ? error.message : String(error),
        }, null, 2));
        throw error;
    }
    console.log(`Results: ${ctx.resultsDir}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    main().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}
