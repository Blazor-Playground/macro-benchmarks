import { readFile, writeFile, readdir, rm, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { type BenchContext, type BuildManifestEntry } from '../context.js';
import {
    type Preset, type Runtime,
    App,
    Runtime as R,
    NON_WORKLOAD_PRESETS,
    PRESET_MAP, PRESET_CONFIG,
    shouldSkipBuild,
} from '../enums.js';
import { dotnetRestore, dotnetPublish, dotnetWorkloadInstall, dotnetWorkloadList } from '../exec.js';
import { banner, info, err } from '../log.js';

// ── Runtime flavor mapping ──────────────────────────────────────────────────

function mapRuntimeFlavor(runtime: Runtime): string {
    return runtime === R.CoreCLR ? 'CoreCLR' : 'Mono';
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

function getRestoreArgs(
    ctx: BenchContext,
    appDir: string,
    app: App,
    preset: Preset,
): string[] {
    const args = [
        appDir,
        `/p:BenchmarkPreset=${PRESET_MAP[preset]}`,
        `/p:RuntimeFlavor=${mapRuntimeFlavor(ctx.runtime)}`,
        `/p:BuildLabel=${ctx.buildLabel}`,
        '/p:MSBuildDisableTaskHost=true',
    ];
    if (ctx.runtimePackDir) {
        args.push(`/p:RuntimePackDir=${ctx.runtimePackDir}`);
    }
    if (app === App.UnoGallery) {
        args.push(`/p:TargetFramework=net${ctx.sdkInfo.major}.0-browserwasm`);
    }
    return args;
}

function getPublishArgs(
    ctx: BenchContext,
    appDir: string,
    app: App,
    preset: Preset,
    publishDir: string,
): string[] {
    const args = [
        appDir,
        '--no-restore',
    ];
    if (app === App.UnoGallery) {
        args.push('--framework', `net${ctx.sdkInfo.major}.0-browserwasm`);
    }
    args.push(
        `/p:BenchmarkPreset=${PRESET_MAP[preset]}`,
        '-c', PRESET_CONFIG[preset],
        `/p:RuntimeFlavor=${mapRuntimeFlavor(ctx.runtime)}`,
        `/p:BuildLabel=${ctx.buildLabel!}`,
        '/p:MSBuildDisableTaskHost=true',
        '/p:DisableParallelEmccCompile=true',
        '/p:DisableParallelAot=true',
        `-bl:${publishDir}/publish.binlog`,
        '-o', publishDir,
    );
    if (ctx.runtimePackDir) {
        args.push(`/p:RuntimePackDir=${ctx.runtimePackDir}`);
    }
    return args;
}

// ── Build phase (shared for non-workload and workload presets) ───────────────

async function buildPhase(
    ctx: BenchContext,
    presets: Preset[],
    succeeded: BuildManifestEntry[],
    failed: string[],
): Promise<void> {
    for (const app of ctx.apps) {
        const appDir = join(ctx.repoRoot, 'src', app);
        for (const preset of presets) {
            const skipReason = shouldSkipBuild(app, preset, ctx);
            if (skipReason) {
                info(`Skipping ${app}/${preset}: ${skipReason}`);
                continue;
            }

            const publishDir = join(ctx.artifactsDir, 'publish', app, ctx.buildLabel!, preset);

            try {
                await rm(publishDir, { recursive: true, force: true });
                await mkdir(publishDir, { recursive: true });

                info(`Building ${app} (runtime=${ctx.runtime}, preset=${preset})`);

                const publishArgs = getPublishArgs(ctx, appDir, app, preset, publishDir);

                // Uno.Gallery uses Uno.Sdk with complex build targets (Resizetizer, ShellTask)
                // that break when restore and publish are split. Run publish with implicit restore.
                const restoreArgs = getRestoreArgs(ctx, appDir, app, preset);
                await dotnetRestore(ctx.dotnetBin!, restoreArgs, { cwd: ctx.repoRoot });

                const startTime = performance.now();
                await dotnetPublish(ctx.dotnetBin!, publishArgs, { cwd: ctx.repoRoot });
                const compileTimeMs = Math.round(performance.now() - startTime);

                await writeFile(
                    join(publishDir, 'compile-time.json'),
                    JSON.stringify({ compileTimeMs, app, runtime: ctx.runtime, preset }, null, 2) + '\n',
                );

                const integrity = await computeIntegrity(publishDir);
                info(`  ${app}/${preset}: ${integrity.fileCount} files, ${(integrity.totalBytes / 1024 / 1024).toFixed(1)} MB, ${compileTimeMs}ms`);

                succeeded.push({ app: app as App, preset, runtime: ctx.runtime, compileTimeMs, integrity, publishDir });
            } catch (e) {
                err(`Build failed for ${app}/${preset}: ${e instanceof Error ? e.message : e}`);
                failed.push(`${app}/${preset}`);
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
    const failed: string[] = [];

    // Phase A: Non-workload presets (before wasm-tools install)
    if (nonWorkloadPresets.length > 0) {
        banner('Build non-workload presets');
        await buildPhase(ctx, nonWorkloadPresets, succeeded, failed);
    }

    // Phase: Install workload (only if workload presets are requested)
    if (workloadPresets.length > 0) {
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

        // Phase B: Workload presets
        banner('Build workload presets');
        await buildPhase(ctx, workloadPresets, succeeded, failed);
    }

    if (succeeded.length === 0) {
        throw new Error('All builds failed — nothing to measure');
    }
    if (failed.length > 0) {
        info(`${succeeded.length} builds succeeded, ${failed.length} failed`);
        throw new Error(`Build failed for: ${failed.join(', ')}`);
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
