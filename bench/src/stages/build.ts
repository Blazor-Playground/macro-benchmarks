import { readFile, writeFile, readdir, rm, mkdir, stat, unlink } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { type BenchContext, type BuildManifestEntry } from '../context.js';
import {
    Preset, type Runtime,
    App,
    Runtime as R,
    APP_CONFIG,
    NON_WORKLOAD_PRESETS,
    PRESET_MAP, PRESET_CONFIG,
    shouldSkipBuild,
    clientRuntimeFor,
} from '../enums.js';
import { dotnetRestore, dotnetPublish, dotnetWorkloadInstall, dotnetWorkloadList, ExecError } from '../exec.js';
import { banner, info, err } from '../log.js';
import { ensureBranchCheckout } from '../lib/branch-checkout.js';
import { commitAndPushWithRetry } from '../lib/git-push.js';

// ── Build failure tracking ──────────────────────────────────────────────────

interface BuildFailure {
    target: string;
    errorOutput: string;
}

const ERROR_LINE_PATTERN = /\b(error\s*(:|MSB|CS|NU|NETSDK|TS)\S*|Build FAILED)\b/i;

function extractErrorLines(output: string): string[] {
    const seen = new Set<string>();
    const results: string[] = [];
    for (const line of output.split('\n')) {
        if (ERROR_LINE_PATTERN.test(line)) {
            const trimmed = line.trim();
            if (trimmed && !seen.has(trimmed)) {
                seen.add(trimmed);
                results.push(trimmed);
            }
        }
    }
    return results.slice(0, 50);
}

// ── Runtime flavor mapping ──────────────────────────────────────────────────

function getRuntimeProps(runtime: Runtime): string[] {
    if (runtime === R.NativeAOTLLVM) {
        return ['/p:UsingNativeAOT=true'];
    }
    return [`/p:RuntimeFlavor=${runtime === R.CoreCLR ? 'CoreCLR' : 'Mono'}`];
}

// MSBuildProjectName drives the artifacts/{bin,obj}/<name>/<label>/<flavor>/<preset> layout
// (see src/Directory.Build.props). appDir may be a .csproj (projectPath apps) or a directory.
async function getProjectName(appDir: string): Promise<string> {
    if (appDir.endsWith('.csproj')) return basename(appDir, '.csproj');
    const entries = await readdir(appDir);
    const csproj = entries.find(e => e.endsWith('.csproj'));
    return csproj ? basename(csproj, '.csproj') : basename(appDir);
}

// ── Workload detection helpers ───────────────────────────────────────────────

function parseWorkloadVersion(output: string): string | null {
    const match = output.match(/^\s*wasm-tools\s+([\w.\-]+)/m);
    return match ? match[1] : null;
}

function isWorkloadInstalled(output: string): boolean {
    return parseWorkloadVersion(output) !== null;
}

// ── Integrity computation ────────────────────────────────────────────────────

async function computeIntegrity(dir: string): Promise<{ fileCount: number; totalBytes: number }> {
    let fileCount = 0;
    let totalBytes = 0;
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        const parentPath = entry.parentPath || entry.path;
        const fullPath = join(parentPath, entry.name);
        const s = await stat(fullPath);
        fileCount++;
        totalBytes += s.size;
    }
    return { fileCount, totalBytes };
}

// ── Publish arg builder ──────────────────────────────────────────────────────

// The `aot` preset means Mono AOT for Mono and ReadyToRun (R2R) for CoreCLR. R2R needs the
// from-source crossgen2 and WebAssembly SDK pack injected (until they ship in the base SDK).
function isCoreClrR2R(effectiveRuntime: Runtime, preset: Preset): boolean {
    return effectiveRuntime === R.CoreCLR && preset === Preset.Aot;
}

// CoreCLR R2R (aot) uses WasmBuildNative=false, so it needs no wasm-tools workload; Mono aot and
// the native-relinking presets do.
function presetNeedsWorkload(runtime: Runtime, preset: Preset): boolean {
    if (NON_WORKLOAD_PRESETS.has(preset)) return false;
    if (isCoreClrR2R(runtime, preset)) return false;
    return true;
}

function getAdditionalRestoreSources(ctx: BenchContext, r2r: boolean): string[] {
    const sources: string[] = [];
    if (ctx.aspnetCorePackagesDir) sources.push(ctx.aspnetCorePackagesDir);
    if (r2r && ctx.runtimePackagesDir) sources.push(ctx.runtimePackagesDir);
    return sources;
}

// TODO: temporary injection — drop once both land in the daily SDK:
//   - WebAssembly.Pack R2R targets: https://github.com/dotnet/runtime/pull/133378
//   - browser-wasm crossgen2 pack:  https://github.com/dotnet/sdk/issues/55785
function getR2RArgs(ctx: BenchContext, r2r: boolean): string[] {
    if (!r2r) return [];
    const args: string[] = [];
    if (ctx.crossgen2Dir) args.push(`/p:Crossgen2InBuildDir=${ctx.crossgen2Dir}`);
    if (ctx.r2rPackVersion) args.push(`/p:WasmR2RPackVersion=${ctx.r2rPackVersion}`);
    return args;
}

function getRestoreArgs(
    ctx: BenchContext,
    appDir: string,
    runtime: Runtime,
    app: App,
    preset: Preset,
): string[] {
    // blazor-perf: when no usable CoreCLR WASM runtime exists, build the Client with Mono WASM
    // (server-side always runs on CoreCLR regardless of this flag)
    const effectiveRuntime = clientRuntimeFor(app, runtime, ctx.sdkInfo);
    const args = [
        appDir,
        `/p:BenchmarkPreset=${PRESET_MAP[preset]}`,
        // Lift the SDK's targeting ceiling (global prop) so the SDK-major TFM (e.g. net12.0) isn't
        // rejected with NETSDK1045 when the SDK's bundled NETCoreAppMaximumVersion lags its own major.
        `/p:NETCoreAppMaximumVersion=${ctx.sdkInfo.major}.0`,
        ...getRuntimeProps(effectiveRuntime),
        `/p:BuildLabel=${ctx.buildLabel}`,
        '/p:MSBuildDisableTaskHost=true',
        '-m:1',
    ];
    if (ctx.runtimePackDirs?.[effectiveRuntime]) {
        args.push(`/p:RuntimePackDir=${ctx.runtimePackDirs[effectiveRuntime]}`);
    }
    const r2r = isCoreClrR2R(effectiveRuntime, preset);
    const restoreSources = getAdditionalRestoreSources(ctx, r2r);
    if (restoreSources.length > 0) {
        args.push(`/p:RestoreAdditionalProjectSources=${restoreSources.join(';')}`);
    }
    if (ctx.aspnetCorePackagesDir) {
        args.push(`/p:MicrosoftAspNetCoreVersion=${ctx.aspnetCorePackageVersion}`);
    }
    args.push(...getR2RArgs(ctx, r2r));
    if (app === App.UnoGallery) {
        args.push(`/p:TargetFramework=net${ctx.sdkInfo.major}.0-browserwasm`);
    }
    return args;
}

function getPublishArgs(
    ctx: BenchContext,
    appDir: string,
    runtime: Runtime,
    app: App,
    preset: Preset,
    publishDir: string,
): string[] {
    // blazor-perf: when no usable CoreCLR WASM runtime exists, build the Client with Mono WASM
    const effectiveRuntime = clientRuntimeFor(app, runtime, ctx.sdkInfo);
    const args = [
        appDir,
    ];
    // Kestrel-hosted apps do their own restore during publish (the Blazor SDK strips
    // RuntimeIdentifier from the WASM client only during publish, not standalone restore)
    if (!APP_CONFIG[app].kestrelHosted) {
        args.push('--no-restore');
    }
    if (app === App.UnoGallery) {
        args.push('--framework', `net${ctx.sdkInfo.major}.0-browserwasm`);
    }
    // Kestrel-hosted apps must be self-contained so the measure container can run them without the SDK
    if (APP_CONFIG[app].kestrelHosted) {
        const rid = ctx.platform === 'windows' ? 'win-x64' : ctx.platform === 'darwin' ? 'osx-x64' : 'linux-x64';
        args.push('--self-contained', '-r', rid);
    }
    args.push(
        `/p:BenchmarkPreset=${PRESET_MAP[preset]}`,
        `/p:NETCoreAppMaximumVersion=${ctx.sdkInfo.major}.0`,
        '-c', PRESET_CONFIG[preset],
        ...getRuntimeProps(effectiveRuntime),
        `/p:BuildLabel=${ctx.buildLabel!}`,
        ...(ctx.repo ? [`/p:GitHubRepo=${ctx.repo}`] : []),
        '/p:MSBuildDisableTaskHost=true',
        '/p:DisableParallelEmccCompile=true',
        '/p:DisableParallelAot=true',
        '-m:1',
        `-bl:${publishDir}/publish.binlog`,
        '-o', publishDir,
    );
    if (ctx.runtimePackDirs?.[effectiveRuntime]) {
        args.push(`/p:RuntimePackDir=${ctx.runtimePackDirs[effectiveRuntime]}`);
    }
    const r2r = isCoreClrR2R(effectiveRuntime, preset);
    const restoreSources = getAdditionalRestoreSources(ctx, r2r);
    if (restoreSources.length > 0) {
        args.push(`/p:RestoreAdditionalProjectSources=${restoreSources.join(';')}`);
    }
    if (ctx.aspnetCorePackagesDir) {
        args.push(`/p:MicrosoftAspNetCoreVersion=${ctx.aspnetCorePackageVersion}`);
    }
    args.push(...getR2RArgs(ctx, r2r));
    return args;
}

// ── Build phase (shared for non-workload and workload presets) ───────────────

async function buildPhase(
    ctx: BenchContext,
    presets: Preset[],
    succeeded: BuildManifestEntry[],
    failed: BuildFailure[],
): Promise<void> {
    const nugetPackagesDir = join(ctx.artifactsDir, 'nuget-packages');
    const dotnetEnv = { NUGET_PACKAGES: nugetPackagesDir };

    for (const runtime of ctx.runtimes) {
        for (const app of ctx.apps) {
            const appBase = join(ctx.repoRoot, 'src', app);
            const appDir = APP_CONFIG[app].projectPath
                ? join(appBase, APP_CONFIG[app].projectPath!)
                : appBase;
            for (const preset of presets) {
                const skipReason = shouldSkipBuild(runtime, app, preset, ctx);
                if (skipReason) {
                    info(`Skipping ${app}/${preset}: ${skipReason}`);
                    continue;
                }

                const publishDir = join(ctx.artifactsDir, 'publish', app, runtime, ctx.buildLabel!, preset);

                try {
                    // Clean this app+preset's bin/obj/publish so every build starts from a clean state.
                    // A stale obj (e.g. ILLink up-to-date) otherwise leaves the WASM publish asset staging
                    // up-to-date and the served bundle ends up missing framework assemblies.
                    const effectiveRuntime = clientRuntimeFor(app, runtime, ctx.sdkInfo);
                    const flavor = effectiveRuntime === R.CoreCLR ? 'CoreCLR' : 'Mono';
                    const projectName = await getProjectName(appDir);
                    const presetFolder = PRESET_MAP[preset];
                    await rm(join(ctx.artifactsDir, 'bin', projectName, ctx.buildLabel!, flavor, presetFolder), { recursive: true, force: true });
                    await rm(join(ctx.artifactsDir, 'obj', projectName, ctx.buildLabel!, flavor, presetFolder), { recursive: true, force: true });
                    await rm(publishDir, { recursive: true, force: true });
                    await mkdir(publishDir, { recursive: true });

                    info(`Building ${app} (runtime=${runtime}, preset=${preset})`);

                    const publishArgs = getPublishArgs(ctx, appDir, runtime, app, preset, publishDir);

                    // Kestrel-hosted apps do restore as part of publish (Blazor SDK strips RID from client only during publish).
                    // Uno.Gallery uses Uno.Sdk with complex build targets that also need implicit restore.
                    if (!APP_CONFIG[app].kestrelHosted) {
                        const restoreArgs = getRestoreArgs(ctx, appDir, runtime, app, preset);
                        await dotnetRestore(ctx.dotnetBin!, restoreArgs, { cwd: ctx.repoRoot, env: dotnetEnv });
                    }

                    const startTime = performance.now();
                    await dotnetPublish(ctx.dotnetBin!, publishArgs, { cwd: ctx.repoRoot, env: dotnetEnv });
                    const compileTimeMs = Math.round(performance.now() - startTime);

                    await writeFile(
                        join(publishDir, 'compile-time.json'),
                        JSON.stringify({ compileTimeMs, app, runtime, preset }, null, 2) + '\n',
                    );

                    const integrity = await computeIntegrity(publishDir);
                    info(`  ${app}/${preset}: ${integrity.fileCount} files, ${(integrity.totalBytes / 1024 / 1024).toFixed(1)} MB, ${compileTimeMs}ms`);

                    succeeded.push({ app: app as App, preset, runtime, compileTimeMs, integrity, publishDir });
                } catch (e) {
                    err(`Build failed for ${app}/${preset}: ${e instanceof Error ? e.message : e}`);
                    const errorOutput = e instanceof ExecError
                        ? e.stdout + '\n' + e.stderr
                        : (e instanceof Error ? e.message : String(e));
                    failed.push({ target: `${app}/${preset}`, errorOutput });
                }
            }
        }
    }
}

// ── Stage entry point ────────────────────────────────────────────────────────

export async function run(ctx: BenchContext): Promise<BenchContext> {
    // Validate prerequisites
    if (!ctx.sdkInfo) throw new Error('build stage requires ctx.sdkInfo (run resolve-sdk first)');
    if (!ctx.sdkDir) throw new Error('build stage requires ctx.sdkDir (run resolve-sdk first)');
    if (!ctx.dotnetBin) throw new Error('build stage requires ctx.dotnetBin (run resolve-sdk first)');
    if (!ctx.buildLabel) throw new Error('build stage requires ctx.buildLabel (run resolve-sdk first)');

    const sdkInfoPath = join(ctx.sdkDir, 'sdk-info.json');

    // Ensure tracking branch is checked out early so pushFailedMarker can use it
    const trackingDir = join(ctx.repoRoot, 'tracking');
    try {
        await ensureBranchCheckout(ctx.repoRoot, 'tracking', 'tracking');
    } catch (e) {
        err(`Failed to check out tracking branch: ${e instanceof Error ? e.message : e}`);
    }

    await updateLockFile(ctx, trackingDir);

    // Partition presets
    const nonWorkloadPresets = ctx.presets.filter(p => NON_WORKLOAD_PRESETS.has(p));
    const workloadPresets = ctx.presets.filter(p => !NON_WORKLOAD_PRESETS.has(p));

    // Validate no pre-installed workload
    banner('Validate wasm-tools workload is NOT installed');
    const wlOutput = await dotnetWorkloadList(ctx.dotnetBin);
    if (isWorkloadInstalled(wlOutput)) {
        if (ctx.isCI) {
            throw new Error(
                'wasm-tools workload is already installed before non-workload builds. '
                + 'The SDK should not have a workload pre-installed.\n'
                + `dotnet workload list output:\n${wlOutput}`,
            );
        }
        info('wasm-tools is already installed (cached SDK). Non-workload results may differ from CI.');
    } else {
        info('Confirmed: wasm-tools workload is NOT installed');
    }

    const succeeded: BuildManifestEntry[] = [];
    const failed: BuildFailure[] = [];

    // Phase A: Non-workload presets (before wasm-tools install)
    if (nonWorkloadPresets.length > 0) {
        banner('Build non-workload presets');
        await buildPhase(ctx, nonWorkloadPresets, succeeded, failed);
    }

    // Phase: Install workload (only if a requested workload-preset build actually needs it).
    // CoreCLR aot is ReadyToRun (WasmBuildNative=false) and does not need the wasm-tools workload.
    if (workloadPresets.length > 0) {
        const workloadNeeded = workloadPresets.some(p => ctx.runtimes.some(r => presetNeedsWorkload(r, p)));
        if (workloadNeeded) {
            banner('Install wasm-tools workload');
            await dotnetWorkloadInstall(ctx.dotnetBin, 'wasm-tools', { cwd: ctx.repoRoot });

            const verifyOutput = await dotnetWorkloadList(ctx.dotnetBin);
            const workloadVersion = parseWorkloadVersion(verifyOutput);
            if (!workloadVersion) {
                throw new Error(
                    'wasm-tools workload was not found after install.\n'
                    + `dotnet workload list output:\n${verifyOutput}`,
                );
            }
            info(`wasm-tools workload installed: ${workloadVersion}`);

            ctx.sdkInfo.workloadVersion = workloadVersion;
            await writeFile(sdkInfoPath, JSON.stringify(ctx.sdkInfo, null, 2) + '\n');
        } else {
            info('No requested workload-preset build needs the wasm-tools workload (CoreCLR R2R) — skipping install');
        }

        // Phase B: Workload presets (CoreCLR R2R builds here too, without the workload)
        banner('Build workload presets');
        await buildPhase(ctx, workloadPresets, succeeded, failed);
    }

    if (succeeded.length === 0) {
        await pushFailedMarker(ctx, failed);
        throw new Error('All builds failed — nothing to measure');
    }
    if (failed.length > 0) {
        info(`${succeeded.length} builds succeeded, ${failed.length} failed`);
        await pushFailedMarker(ctx, failed);
        throw new Error(`Build failed for: ${failed.map(f => f.target).join(', ')}`);
    }
    info(`${succeeded.length} builds succeeded`);

    // Generate run ID and write manifest
    const runId = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
    const resultsDir = join(ctx.artifactsDir, 'results', runId);
    await mkdir(resultsDir, { recursive: true });

    await writeFile(
        join(resultsDir, 'build-manifest.json'),
        JSON.stringify(succeeded, null, 2) + '\n',
    );

    const sdkInfoContent = await readFile(sdkInfoPath, 'utf-8');
    await writeFile(join(resultsDir, 'sdk-info.json'), sdkInfoContent);
    await writeFile(join(ctx.artifactsDir, 'results', '.run-id'), runId);

    info(`Build manifest written to ${resultsDir}`);

    return { ...ctx, buildManifest: succeeded, runId, resultsDir };
}

// ── Lock file update ─────────────────────────────────────────────────────────

function getCiRunUrl(ctx: BenchContext): string | undefined {
    return ctx.ciRunId
        ? `https://github.com/${ctx.repo}/actions/runs/${ctx.ciRunId}`
        : undefined;
}

async function updateLockFile(ctx: BenchContext, trackingDir: string): Promise<void> {
    if (!ctx.sdkInfo?.sdkVersion) return;

    const sdkVersion = ctx.sdkInfo.sdkVersion;
    const lockFile = join(trackingDir, 'locks', `${sdkVersion}.lock`);
    if (!existsSync(lockFile)) return;

    try {
        await commitAndPushWithRetry({
            dir: trackingDir,
            addPaths: ['locks/'],
            commitMessage: `Update lock ${sdkVersion}`,
            label: `Update lock for ${sdkVersion}`,
            dryRun: ctx.dryRun,
            applyChanges: async () => {
                const current = JSON.parse(await readFile(lockFile, 'utf-8'));
                current.ciRunId = ctx.ciRunId;
                current.ciRunUrl = getCiRunUrl(ctx);
                await writeFile(lockFile, JSON.stringify(current, null, 2) + '\n', 'utf-8');
            },
        });
    } catch (e) {
        err(`Failed to update lock file: ${e instanceof Error ? e.message : e}`);
    }
}

// ── Failure marker ───────────────────────────────────────────────────────────

async function pushFailedMarker(ctx: BenchContext, failures: BuildFailure[]): Promise<void> {
    if (!ctx.sdkInfo?.sdkVersion) return;

    const sdkVersion = ctx.sdkInfo.sdkVersion;
    if (ctx.dryRun) {
        info(`[dry-run] Skipping .failed marker for ${sdkVersion}`);
        return;
    }
    const trackingDir = join(ctx.repoRoot, 'tracking');

    const locksDir = join(trackingDir, 'locks');
    await mkdir(locksDir, { recursive: true });

    const lockFile = join(locksDir, `${sdkVersion}.lock`);
    const failedFile = join(locksDir, `${sdkVersion}.failed`);

    const content = {
        failedAt: new Date().toISOString(),
        ciRunId: ctx.ciRunId,
        ciRunUrl: getCiRunUrl(ctx),
        failures: failures.map(f => ({
            target: f.target,
            errorLines: extractErrorLines(f.errorOutput),
        })),
    };

    await commitAndPushWithRetry({
        dir: trackingDir,
        addPaths: ['locks/'],
        commitMessage: `Failed ${sdkVersion}`,
        label: `Failed marker for ${sdkVersion}`,
        dryRun: ctx.dryRun,
        applyChanges: async () => {
            await writeFile(failedFile, JSON.stringify(content, null, 2) + '\n', 'utf-8');
            if (existsSync(lockFile)) await unlink(lockFile);
        },
    });
}
