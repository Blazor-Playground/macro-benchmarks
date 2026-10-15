import { cp, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { join, basename, dirname, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { cpus, arch, platform, release, totalmem } from 'node:os';
import { createServer } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Browser, BrowserContext, Page, Response as BrowserResponse } from 'playwright';
import type { BenchContext } from '../context.js';
import { Preset, Runtime, parseRuntime } from '../enums.js';
import { buildSettings, msbuildArgs } from '../lib/build-settings.js';
import { info, err } from '../log.js';
import { parseArcadeDate } from '../lib/version-utils.js';
import { runHavitWalkthrough } from '../lib/havit-walkthrough.js';
import { DebugProcess, DebugProcessError } from '../lib/debug-process.js';
import { DEBUG_BROWSER_SIGNAL_OPTIONS, installDebugCancellation, waitForDebugOperation } from '../lib/debug-cancellation.js';
import { DebugProbe, type ObservedRender } from '../lib/debug-probe.js';
import {
    DEBUG_APPS, DEBUG_METHOD, DEBUG_SCENARIOS, emptyDebugMeasurements, digest, hotReloadFailure,
    scenarioKeys, summarizeDebug, validateDebugBatch,
    type DebugAttempt, type DebugBatch, type DebugOutcome, type DebugRuntime, type DebugScenario,
} from '../lib/debug-results.js';

const execute = promisify(execFile);
const PROJECTS: Record<string, string> = {
    'empty-blazor': 'EmptyBlazor.csproj', 'havit-bootstrap': 'HavitBootstrap.csproj',
};
const PROPERTY_NAMES = [
    'NETCoreSdkVersion', 'NETCoreSdkRuntimeIdentifier', 'TargetFramework', 'Configuration', 'BenchmarkPreset', 'RuntimeFlavor', 'UseMonoRuntime',
    'RuntimeIdentifier', 'RuntimeFrameworkVersion', 'BundledNETCoreAppPackageVersion',
    'BundledNETCoreAppTargetFrameworkVersion', 'MicrosoftAspNetCoreVersion',
    '_SdkTfm', '_UseNet12TargetFrameworkWorkaround', 'NETCoreAppMaximumVersion', 'TargetsCurrent',
    'RunCommand', 'RunArguments', 'MSBuildDisableTaskHost', 'WasmBuildNative', 'UsingBrowserRuntimeWorkload',
    'PublishTrimmed', 'CompressionEnabled', 'WasmEnableWebcil', 'WasmIncludeFullIcuData', 'DebugSymbols',
    'MetricsSupport', 'EventSourceSupport', 'StackTraceSupport', 'RunAOTCompilation', 'PublishReadyToRun',
    'WasmFingerprintAssets', 'BlazorFingerprintBlazorJs', 'WasmEnableHotReload', 'WasmEmitSymbolMap', 'EnableAggressiveTrimming',
    'DisableParallelEmccCompile', 'DisableParallelAot', 'AssemblyName', 'BlazorWebAssemblyLoadAllGlobalizationData',
    'NoDefaultLaunchSettingsFile', 'StaticWebAssetProjectMode', 'RuntimePackDir', 'WasmR2RPackVersion', 'Crossgen2InBuildDir',
];
const POLICY = 'prepared-dependencies;clean-first-build;edited-incremental;warm-stable-origin;service-workers-blocked;desktop;debugger-detached;sdk-default-build-servers';

export function debugBuildArgs(runtime: DebugRuntime): string[] {
    return msbuildArgs(buildSettings(Preset.DevLoop, parseRuntime(runtime)));
}

export function debugEntryHtml(html: string): string {
    return html.replaceAll('#[.{fingerprint}]', '').replace('<script type="importmap"></script>', '');
}

async function hashTree(root: string): Promise<string> {
    const hash = createHash('sha256');
    async function walk(dir: string, prefix: string): Promise<void> {
        for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
            if (['bin', 'obj', 'node_modules', 'artifacts', '.git'].includes(entry.name)) continue;
            if (entry.name === 'runtime-ready.mjs' && prefix.endsWith('wwwroot/')) continue;
            if (entry.isSymbolicLink()) throw new Error(`Source snapshot cannot contain symlinks: ${join(dir, entry.name)}`);
            const path = join(dir, entry.name);
            if (entry.isDirectory()) await walk(path, `${prefix}${entry.name}/`);
            else if (entry.isFile()) { hash.update(`${prefix}${entry.name}\0`); hash.update(await readFile(path)); }
        }
    }
    await walk(root, '');
    return hash.digest('hex');
}

async function availablePort(): Promise<number> {
    const server = createServer();
    await new Promise<void>((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Could not reserve a loopback port');
    await new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept()));
    return address.port;
}

async function snapshot(ctx: BenchContext, app: string, runtime: DebugRuntime, root: string, sdk: string): Promise<string> {
    await mkdir(join(root, 'src'), { recursive: true });
    for (const name of ['Directory.Build.props', 'Directory.Build.targets', 'versions.props', 'presets.props', 'runtimes.props', 'runtime-ready.mjs']) {
        await cp(join(ctx.repoRoot, 'src', name), join(root, 'src', name));
    }
    const props = join(root, 'src', 'Directory.Build.props');
    const originalProps = await readFile(props, 'utf8');
    if (!originalProps.startsWith('<Project>')) throw new Error('Unrecognized shared build properties layout');
    const settingsXml = Object.entries(buildSettings(Preset.DevLoop, parseRuntime(runtime)))
        .map(([name, value]) => `    <${name}>${value}</${name}>`).join('\n');
    await writeFile(props, originalProps.replace('<Project>', `<Project>\n  <PropertyGroup>\n${settingsXml}\n  </PropertyGroup>`));
    await cp(join(ctx.repoRoot, 'NuGet.config'), join(root, 'NuGet.config'));
    await cp(join(ctx.repoRoot, 'src', app), join(root, 'src', app), {
        recursive: true, preserveTimestamps: true,
        filter: source => !['bin', 'obj', 'node_modules', 'artifacts'].includes(basename(source))
            && !(basename(source) === 'runtime-ready.mjs' && basename(dirname(source)) === 'wwwroot'),
    });
    const appDir = join(root, 'src', app);
    await cp(join(ctx.repoRoot, 'bench', 'fixtures', 'debug-probe'), join(appDir, 'BenchmarkProbe'), { recursive: true });
    const appFile = join(appDir, 'App.razor');
    await writeFile(appFile, `${await readFile(appFile, 'utf8')}\n@using MacroBenchmarks.DebugProbe\n<DebugProbe />\n`);
    // Resolve only the publish-specific placeholders, retaining the real app's styles/content.
    const index = join(appDir, 'wwwroot', 'index.html');
    await writeFile(index, debugEntryHtml(await readFile(index, 'utf8')));
    await writeFile(join(root, 'global.json'), JSON.stringify({ sdk: { version: sdk, rollForward: 'disable', allowPrerelease: true } }));
    return join(appDir, PROJECTS[app]);
}

function failureOutcome(error: unknown, phase: string, output: string): DebugOutcome {
    if (/rude edit|ENC\d{4}|not supported.*edit/i.test(output)) return 'unsupported-edit';
    if (error instanceof Error && /timeout/i.test(error.message)) return 'timeout';
    if (/error (?:CS|RZ|NETSDK|MSB|NU)\d+|Build failed/i.test(output) || phase === 'restore' || phase === 'build') return 'build-failed';
    if (error instanceof DebugProcessError) return 'launch-failed';
    return phase === 'hot-reload' ? 'transport-failed' : 'invalid-sample';
}

interface TrialOptions {
    ctx: BenchContext;
    app: string;
    runtime: DebugRuntime;
    scenario: DebugScenario;
    trial: number;
    root: string;
    sdk: string;
    dotnet: string;
    browser: Browser;
    signal: AbortSignal;
}

async function runTrial(options: TrialOptions): Promise<{ attempt: DebugAttempt; buildMs: number | null; properties: Record<string, string> }> {
    const { ctx, app, runtime, scenario, trial, root, sdk, dotnet, browser, signal } = options;
    const attempt: DebugAttempt = {
        trial, status: 'not-run', reason: '', startedAt: new Date().toISOString(), valueMs: null,
        phases: {}, commands: [], sourceBefore: '', sourceAfter: '',
    };
    let properties: Record<string, string> = {};
    let buildMs: number | null = null;
    const running: { host: DebugProcess | null } = { host: null };
    let context: BrowserContext | null = null;
    let phase = 'restore';
    let logs = '';
    const preparationStarted = performance.now();
    const project = await snapshot(ctx, app, runtime, root, sdk);
    const sourceFile = join(dirname(project), 'BenchmarkProbe', 'BenchmarkEdit.cs');
    const source = await readFile(sourceFile, 'utf8');
    attempt.sourceBefore = digest(source);
    const port = await availablePort();
    const url = `http://127.0.0.1:${port}/`;
    const env = {
        ...process.env, DOTNET_ROOT: dirname(dotnet), PATH: `${dirname(dotnet)}:${process.env.PATH}`,
        DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
        DOTNET_CLI_UI_LANGUAGE: 'en-US',
        ASPNETCORE_URLS: url, ASPNETCORE_ENVIRONMENT: 'Development', DOTNET_ENVIRONMENT: 'Development',
        DOTNET_WATCH_SUPPRESS_LAUNCH_BROWSER: '1', DOTNET_WATCH_SUPPRESS_EMOJIS: '1',
    };
    const args = debugBuildArgs(runtime);
    const start = (commandArgs: string[]) => {
        signal.throwIfAborted();
        attempt.commands.push([dotnet, ...commandArgs]);
        return new DebugProcess(dotnet, commandArgs, root, env);
    };
    const short = async (commandArgs: string[]) => {
        const proc = start(commandArgs);
        try {
            const output = await proc.wait(ctx.timeout, signal);
            return { output, duration: proc.ended - proc.started };
        } finally { logs += proc.output; await proc.close(); }
    };
    const launch = (watch: boolean, noBuild = false) => {
        phase = 'launch';
        running.host = start(watch
            ? ['watch', '--non-interactive', '--verbose', '--project', project]
            : ['run', '--project', project, '--no-launch-profile', ...args, ...(noBuild ? ['--no-build'] : [])]);
        return running.host;
    };
    const navigate = async (page: Page, probe: DebugProbe, proc: DebugProcess, expected: string): Promise<ObservedRender> => {
        const deadline = performance.now() + ctx.timeout;
        let ready = false;
        while (performance.now() < deadline) {
            signal.throwIfAborted();
            proc.check();
            try {
                const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(500)]) });
                if (response.ok) { ready = true; break; }
            } catch (error) {
                signal.throwIfAborted();
                if (!(error instanceof TypeError) && !(error instanceof DOMException && error.name === 'TimeoutError')) throw error;
            }
            if (/Exited with error code|Build failed|error (CS|RZ|NETSDK|NU)\d+/i.test(proc.output)) {
                throw new DebugProcessError('Development host failed to start', proc.output);
            }
            await sleep(25);
        }
        if (!ready) throw new Error('Development host readiness timeout');
        proc.check();
        attempt.phases.hostReady = performance.now() - proc.started;
        const navAt = performance.now();
        await waitForDebugOperation(signal, () => page.goto(url, { waitUntil: 'domcontentloaded', timeout: ctx.timeout }));
        const rendered = await probe.waitFor(e => e.version === expected, navAt, proc, ctx.timeout, signal);
        if (rendered.evidence.debuggerAttached || rendered.evidence.runtime !== runtime) {
            throw new Error(`Unexpected runtime/debugger: ${JSON.stringify(rendered.evidence)}`);
        }
        return rendered;
    };
    try {
        await short(['restore', project, ...args]);
        const evaluated = await short(['msbuild', project, ...args, `-getProperty:${PROPERTY_NAMES.join(',')}`]);
        const parsed: { Properties: Record<string, string> } = JSON.parse(evaluated.output);
        properties = parsed.Properties;
        attempt.properties = properties;
        if (properties.RuntimePackDir || properties.WasmR2RPackVersion || properties.Crossgen2InBuildDir) {
            throw new Error('Custom runtime/SDK pack overrides are not clean Debug');
        }
        if (Number(properties.BundledNETCoreAppPackageVersion.split('.')[0])
            > Number(properties.TargetFramework.match(/^net(\d+)\./)?.[1] ?? 0)) {
            properties.SdkTargetingWarning = `SDK ${sdk} targets ${properties.TargetFramework} but bundles ${properties.BundledNETCoreAppPackageVersion} packages. Shared SDK12 targeting bridge: ${properties._UseNet12TargetFrameworkWorkaround || 'inactive'}.`;
        }
        if (properties.Configuration !== 'Debug' || properties.NETCoreSdkVersion !== sdk || !properties.TargetFramework
            || !/WasmAppHost|blazor-devserver/i.test(properties.RunArguments)) {
            throw new Error('Unsupported SDK run host or unexpected evaluated Debug configuration');
        }
        const trialContext = await browser.newContext({ locale: 'en-US', serviceWorkers: 'block' });
        context = trialContext;
        signal.throwIfAborted();
        const page = await waitForDebugOperation(signal, () => trialContext.newPage());
        const payload: { response: BrowserResponse | null } = { response: null };
        page.on('response', response => {
            if (/\/dotnet\.native(?:\.[^/]+)?\.wasm$/.test(new URL(response.url()).pathname)) payload.response = response;
        });
        const probe = new DebugProbe();
        await waitForDebugOperation(signal, () => probe.install(page, app));
        page.on('pageerror', error => { logs += `\n[page] ${error.message}`; });
        attempt.phases.preparation = performance.now() - preparationStarted;

        const proc = launch(scenario === 'hot-reload');
        const initial = await navigate(page, probe, proc, 'before-0001');
        if (payload.response) {
            const response = payload.response;
            properties.RuntimePayloadDigest = digest(await waitForDebugOperation(signal, () => response.body()));
        }
        properties.MetadataUpdaterIsSupported = String(initial.evidence.metadataUpdates);
        attempt.before = initial.evidence;
        if (scenario === 'first-run') {
            attempt.valueMs = initial.at - proc.started;
            attempt.after = initial.evidence;
        } else if (scenario === 'walkthrough') {
            phase = 'walkthrough';
            attempt.valueMs = await waitForDebugOperation(signal,
                () => runHavitWalkthrough({ page, url, timeout: ctx.timeout, verbose: ctx.verbose }));
            attempt.after = initial.evidence;
        } else {
            if (scenario === 'hot-reload' && !initial.evidence.metadataUpdates) {
                attempt.status = 'unsupported-runtime';
                attempt.reason = `${runtime} MetadataUpdater.IsSupported=false in SDK ${sdk}. CoreCLR WASM enablement: https://github.com/dotnet/runtime/issues/134337`;
                return { attempt, buildMs, properties };
            }
            if (scenario === 'hot-reload') {
                // Watch builds its Roslyn workspace after the browser connects. An earlier edit
                // can become its baseline instead of an update, even though the app has rendered.
                const deadline = performance.now() + ctx.timeout;
                while (!/Waiting for changes|Watching for file changes/i.test(proc.output)) {
                    signal.throwIfAborted(); proc.check();
                    if (performance.now() >= deadline) throw new Error('dotnet watch readiness timeout');
                    await sleep(20);
                }
                attempt.phases.watchReady = performance.now() - proc.started;
            }
            await waitForDebugOperation(signal, () => page.locator('#debug-benchmark-counter').click());
            const settled = await probe.waitFor(e => e.counter === 1, initial.at, proc, ctx.timeout, signal);
            attempt.before = settled.evidence;
            attempt.phases.baseline = settled.at - proc.started;
            const beforeNavigation = probe.navigations;
            const beforeReset = probe.contextResets;
            attempt.hostPidsBefore = await proc.hostPids();
            if (scenario === 'incremental-run') { await proc.close(); running.host = null; }
            const edited = source.replace('"before-0001"', '"after--0001"');
            if (edited === source) throw new Error('Controlled edit did not change its source');
            const pendingEdit = `${sourceFile}.pending`;
            await writeFile(pendingEdit, edited);
            const editAt = performance.now();
            await rename(pendingEdit, sourceFile);
            attempt.sourceAfter = digest(edited);

            if (scenario === 'hot-reload') {
                phase = 'hot-reload';
                const after = await probe.waitFor(e => e.version === 'after--0001', editAt, proc, ctx.timeout, signal);
                attempt.after = after.evidence;
                // Detect a delayed automatic restart too; the settling time is not part of latency.
                await sleep(250, undefined, { signal });
                proc.check();
                attempt.navigations = probe.navigations - beforeNavigation;
                attempt.contextResets = probe.contextResets - beforeReset;
                attempt.hostPidsAfter = await proc.hostPids();
                const failure = hotReloadFailure(settled.evidence, after.evidence, attempt.navigations,
                    attempt.contextResets, attempt.hostPidsBefore, attempt.hostPidsAfter);
                if (failure) {
                    attempt.status = failure;
                    attempt.reason = 'An applied edit did not preserve document/runtime/host identity and component state';
                    return { attempt, buildMs, properties };
                }
                const delta = probe.deltas.find(delta => delta.at >= editAt && delta.generation === after.evidence.generation);
                if (!delta) throw new Error('Rendered update has no applied-delta acknowledgement');
                attempt.phases.deltaApplied = delta.at - editAt;
                attempt.valueMs = after.at - editAt;
            } else {
                if (scenario === 'rebuild') {
                    await proc.close(); running.host = null;
                    phase = 'build';
                    buildMs = (await short(['build', project, ...args])).duration;
                    attempt.phases.build = buildMs;
                }
                const next = launch(false, scenario === 'rebuild');
                const after = await navigate(page, probe, next, 'after--0001');
                if (after.evidence.runtimeId === settled.evidence.runtimeId || after.evidence.documentId === settled.evidence.documentId) {
                    throw new Error('Incremental restart did not create a new runtime and document');
                }
                attempt.after = after.evidence;
                attempt.valueMs = after.at - (scenario === 'rebuild' ? editAt : next.started);
            }
        }
        signal.throwIfAborted();
        attempt.status = 'ok';
    } catch (error) {
        if (running.host) logs += running.host.output;
        const output = error instanceof DebugProcessError ? error.output : logs;
        attempt.status = signal.aborted ? 'cancelled' : failureOutcome(error, phase, output);
        attempt.reason = `${phase}: ${error instanceof Error ? error.message : error}${properties.SdkTargetingWarning ? ` ${properties.SdkTargetingWarning}` : ''}`;
        attempt.valueMs = null;
        err(`${app}/${runtime}/${scenario}: ${attempt.status}: ${attempt.reason}\n${sanitizeDebugLog(output).slice(-4000)}`);
    } finally {
        try { if (running.host) { logs += running.host.output; await running.host.close(); } }
        finally {
            try { if (context) await context.close(); }
            finally {
                await writeFile(sourceFile, source);
                if (digest(await readFile(sourceFile)) !== attempt.sourceBefore) throw new Error('Source restoration failed');
                await writeFile(join(root, 'trial.log'), sanitizeDebugLog(logs));
            }
        }
    }
    return { attempt, buildMs, properties };
}

export async function run(ctx: BenchContext): Promise<BenchContext> {
    if (platform() === 'win32') throw new Error('Clean-Debug process supervision currently supports macOS and Linux');
    if (ctx.dryRun || ctx.presets.some(p => p !== Preset.DevLoop)) throw new Error('Clean Debug requires preset dev-loop and a real bounded run');
    if (ctx.runtimes.some(runtime => runtime !== 'mono' && runtime !== 'coreclr')) throw new Error('Clean Debug supports Mono and CoreCLR comparisons only');
    if (!ctx.timeout || ctx.timeout < 0) throw new Error('Clean Debug requires a positive timeout');
    if (ctx.runtimePR || ctx.runtimeCommit || ctx.aspnetCorePR || ctx.aspnetCoreCommit
        || ctx.runtimePack || ctx.runtimePackDirs || ctx.aspnetCorePackagesDir) {
        throw new Error('Clean Debug requires an unmodified installed SDK, not custom runtime/ASP.NET packs');
    }
    const requestedDotnet = ctx.debugDotnet || ctx.dotnetBin || 'dotnet';
    const dotnet = await realpath(requestedDotnet.includes('/') ? requestedDotnet : (await execute('which', [requestedDotnet])).stdout.trim());
    const sdk = (await execute(dotnet, ['--version'], { cwd: ctx.repoRoot })).stdout.trim();
    if (ctx.sdkVersion && ctx.sdkVersion !== sdk) throw new Error(`Selected dotnet runs SDK ${sdk}, not requested ${ctx.sdkVersion}`);
    if (ctx.sdkInfo && ctx.sdkInfo.sdkVersion !== sdk) throw new Error('Context SDK provenance does not match the installed SDK');
    const sdkList = (await execute(dotnet, ['--list-sdks'])).stdout;
    const sdkEntry = sdkList.split('\n').find(line => line.startsWith(`${sdk} [`));
    const sdkBase = sdkEntry?.match(/\[(.*)\]/)?.[1];
    let sdkHash: string | null = ctx.sdkInfo?.sdkGitHash || null;
    if (!sdkHash && sdkBase) {
        try {
            const versionFile = await readFile(join(sdkBase, sdk, '.version'), 'utf8');
            sdkHash = versionFile.match(/^[a-f0-9]{40}$/m)?.[0] || null;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            info('Installed SDK does not expose a .version source hash; retaining unknown provenance');
        }
    }
    const runs = ctx.debugRuns ?? 5;
    const scenarios = (ctx.debugScenarios ?? [...DEBUG_SCENARIOS]) as DebugScenario[];
    if (!Number.isInteger(runs) || runs < 1 || runs > 50 || scenarios.some(s => !DEBUG_SCENARIOS.includes(s))) {
        throw new Error('Invalid clean-Debug sample/scenario selection');
    }
    const batchesDir = resolve(ctx.resultsDir || join(ctx.artifactsDir, 'debug-results'));
    const runId = randomUUID();
    await mkdir(batchesDir, { recursive: true });
    const runRoot = resolve(ctx.artifactsDir, 'debug-runs', runId);
    await mkdir(runRoot, { recursive: true });
    const sha = (await execute('git', ['rev-parse', 'HEAD'], { cwd: ctx.repoRoot })).stdout.trim();
    const sharedInputs = await Promise.all(['Directory.Build.props', 'Directory.Build.targets', 'versions.props', 'presets.props', 'runtimes.props', 'runtime-ready.mjs']
        .map(file => readFile(join(ctx.repoRoot, 'src', file), 'utf8')));
    const harnessDigest = digest(JSON.stringify([
        await hashTree(join(ctx.repoRoot, 'bench', 'src')), await hashTree(join(ctx.repoRoot, 'bench', 'fixtures', 'debug-probe')),
        await readFile(join(ctx.repoRoot, 'bench', 'package-lock.json'), 'utf8'), sharedInputs,
        await readFile(join(ctx.repoRoot, 'NuGet.config'), 'utf8'),
    ]));
    const cancellation = installDebugCancellation();
    const signal = cancellation.signal;
    let browser: Browser | null = null;
    let failed = false;
    try {
        const { chromium } = await import('playwright');
        const browserChannel = ctx.debugBrowserChannel || ctx.chromiumChannel;
        browser = await chromium.launch({
            headless: ctx.headless, timeout: ctx.timeout, ...DEBUG_BROWSER_SIGNAL_OPTIONS,
            ...(browserChannel ? { channel: browserChannel } : {}),
        });
        signal.throwIfAborted();
        const browserVersion = browser.version();
        const playwrightPackage = JSON.parse(await readFile(join(ctx.repoRoot, 'node_modules', 'playwright', 'package.json'), 'utf8'));
        for (const app of ctx.apps) {
            const supported = (DEBUG_APPS as readonly string[]).includes(app);
            const batch: DebugBatch = {
                kind: 'debug-dev-loop', schemaVersion: 1, methodology: DEBUG_METHOD, id: `${runId}-${app}`,
                app, preset: 'dev-loop', configuration: 'Debug', measuredAt: new Date().toISOString(), smoke: runs < 5,
                sdk: {
                    version: sdk, day: ctx.sdkInfo?.releaseDate || parseArcadeDate(sdk)?.toISOString().slice(0, 10) || null,
                    sdkHash, runtimeHash: ctx.sdkInfo?.runtimeGitHash || null,
                    aspnetHash: ctx.sdkInfo?.aspnetCoreGitHash || null, vmrHash: ctx.sdkInfo?.vmrGitHash || null,
                },
                source: { harnessSha: sha, harnessDigest, appDigest: supported ? await hashTree(join(ctx.repoRoot, 'src', app)) : 'unsupported' },
                environment: {
                    os: `${platform()} ${release()}`, arch: arch(), cpu: cpus()[0]?.model || 'unknown',
                    cpuCount: cpus().length, memoryBytes: totalmem(), browser: browserVersion,
                    browserChannel: browserChannel || 'chromium', playwright: playwrightPackage.version, node: process.version,
                    headless: ctx.headless, runnerClass: process.env.RUNNER_ENVIRONMENT || 'local-shared-host',
                    runnerId: `${process.env.RUNNER_NAME || 'local'}:${runId}`, controlled: ctx.isCI,
                    ...(ctx.runtimes.includes(Runtime.Mono) && ctx.runtimes.includes(Runtime.CoreCLR)
                        ? { comparisonScope: ctx.isCI ? 'ci-paired' as const : 'local-paired' as const } : {}),
                    policy: `${POLICY};watcher=${process.env.DOTNET_USE_POLLING_FILE_WATCHER || 'native'};verbose=${ctx.verbose}`,
                },
                runtimes: {
                    mono: { properties: {}, measurements: emptyDebugMeasurements(runs) },
                    coreclr: { properties: {}, measurements: emptyDebugMeasurements(runs) },
                },
            };
            const save = async () => {
                for (const rt of ['mono', 'coreclr'] as const) for (const key of Object.keys(batch.runtimes[rt].measurements)) {
                    const metric = batch.runtimes[rt].measurements[key as keyof typeof batch.runtimes.mono.measurements];
                    Object.assign(metric, summarizeDebug(metric.attempts, runs));
                }
                validateDebugBatch(batch);
                const file = join(batchesDir, `debug-${batch.id}.json`);
                await writeFile(`${file}.tmp`, JSON.stringify(batch, null, 2) + '\n');
                await rename(`${file}.tmp`, file);
            };
            await save();
            for (const scenario of scenarios) {
                for (let trial = 1; trial <= runs; trial++) {
                    for (const runtime of (trial % 2 ? ['mono', 'coreclr'] : ['coreclr', 'mono']) as DebugRuntime[]) {
                        if (!ctx.runtimes.some(value => value === runtime)) continue;
                        const unsupported = !supported ? `No clean-Debug render/edit adapter for ${app}`
                            : scenario === 'walkthrough' && app !== 'havit-bootstrap' ? 'This app has no elapsed-time walkthrough'
                                : runtime === 'coreclr' && Number(sdk.split('.')[0]) < 11 ? 'CoreCLR browser runtime requires SDK 11 or later' : null;
                        info(`Clean Debug ${app}/${runtime}/${scenario} ${trial}/${runs}`);
                        const root = join(runRoot, `${app}-${runtime}-${scenario}-${trial}`);
                        let result;
                        if (unsupported || signal.aborted) {
                            const attempt: DebugAttempt = {
                                trial, status: signal.aborted ? 'cancelled' : !supported || scenario === 'walkthrough' ? 'unsupported-app' : 'unsupported-runtime',
                                reason: signal.aborted ? String(signal.reason) : unsupported!, startedAt: new Date().toISOString(), valueMs: null,
                                phases: {}, commands: [], sourceBefore: '', sourceAfter: '',
                            };
                            result = { attempt, buildMs: null, properties: {} };
                        } else {
                            try {
                                result = await runTrial({ ctx, app, runtime, scenario, trial, root, sdk, dotnet, browser, signal });
                            } catch (error) {
                                const reason = `Trial setup/cleanup failed: ${error instanceof Error ? error.message : error}`;
                                err(reason);
                                result = { attempt: {
                                    trial, status: signal.aborted ? 'cancelled' as const : 'invalid-sample' as const, reason, startedAt: new Date().toISOString(), valueMs: null,
                                    phases: {}, commands: [], sourceBefore: '', sourceAfter: '',
                                }, buildMs: null, properties: {} };
                            }
                        }

                        if (Object.keys(result.properties).length) batch.runtimes[runtime].properties = result.properties;
                        for (const key of scenarioKeys(scenario)) {
                            batch.runtimes[runtime].measurements[key].attempts.push({
                                ...result.attempt, valueMs: result.attempt.status === 'ok' && key === 'debug-incremental-build'
                                    ? result.buildMs : result.attempt.valueMs,
                            });
                        }
                        info(`  ${result.attempt.status}${result.attempt.valueMs !== null ? `: ${result.attempt.valueMs.toFixed(1)} ms` : `: ${result.attempt.reason}`}`);
                        if (!['ok', 'unsupported-app', 'unsupported-runtime', 'not-run'].includes(result.attempt.status)) failed = true;
                        await save();
                        // Logs and records remain; bulky sandbox outputs are never needed to interpret a successful trial.
                        if (result.attempt.status === 'ok') await rm(join(root, 'artifacts'), { recursive: true, force: true });
                        if (signal.aborted) break;
                    }
                    if (signal.aborted) break;
                }
                if (signal.aborted) break;
            }
            if (signal.aborted) break;
        }
    } finally {
        try { if (browser) await browser.close(); }
        finally { cancellation.dispose(); }
    }
    if (failed || signal.aborted) throw new Error(`Clean-Debug measurements failed; partial evidence is in ${batchesDir}`);
    return { ...ctx, resultsDir: batchesDir, runId };
}

function sanitizeDebugLog(output: string): string {
    return output.replace(/((?:ASPNETCORE_AUTO_RELOAD_WS_KEY|[A-Z_]*SHARED_SECRET)[=:])\S+/g, '$1[redacted]');
}
