import { mkdir, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { type BenchContext } from '../context.js';
import { Runtime } from '../enums.js';
import { exec } from '../exec.js';
import { banner, info, err } from '../log.js';import { findNupkg, parseVersionFromNupkg } from '../lib/package-utils.js';
// ── Constants ────────────────────────────────────────────────────────────────

const MONO_RUNTIME_PACK_GLOB = 'Microsoft.NETCore.App.Runtime.Mono.browser-wasm';
const CORECLR_RUNTIME_PACK_GLOB = 'Microsoft.NETCore.App.Runtime.browser-wasm';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRuntimeCloneDir(artifactsDir: string): string {
    return join(artifactsDir, 'runtime-src');
}

function getBuildArtifactsDir(cloneDir: string): string {
    return join(cloneDir, 'artifacts');
}

function getExtractDir(artifactsDir: string, flavor: 'mono' | 'coreclr'): string {
    return join(artifactsDir, `runtime-pack-${flavor}`);
}


// ── Clone ────────────────────────────────────────────────────────────────────

async function cloneRuntime(repo: string, commit: string, cloneDir: string): Promise<void> {
    if (existsSync(join(cloneDir, '.git'))) {
        info(`Runtime repo already cloned at ${cloneDir} — fetching latest`);
        await exec('git', ['-C', cloneDir, 'fetch', 'origin'], { label: 'git fetch' });
    } else {
        await mkdir(cloneDir, { recursive: true });
        const repoUrl = `https://github.com/${repo}.git`;
        info(`Cloning ${repoUrl}...`);
        await exec('git', [
            'clone', '--no-checkout', '--filter=blob:none', repoUrl, cloneDir,
        ], { label: 'git clone' });
    }

    info(`Checking out ${commit.slice(0, 10)}...`);
    await exec('git', ['-C', cloneDir, 'checkout', commit], { label: 'git checkout' });
}

// ── Build ────────────────────────────────────────────────────────────────────

async function buildFlavor(
    cloneDir: string,
    flavor: 'mono' | 'coreclr',
    platform: 'windows' | 'linux' | 'darwin',
): Promise<void> {
    const isWin = platform === 'windows';
    const buildScript = isWin ? join(cloneDir, 'build.cmd') : join(cloneDir, 'build.sh');
    const shell = isWin ? 'cmd' : 'bash';

    const subset = flavor === 'mono' ? 'mono+libs' : 'clr+libs';

    // Always clean artifacts before building to avoid cross-flavor contamination
    // (e.g. mono ICU files causing NU5118 duplicate-file errors in coreclr packs).
    const buildArtifactsDir = getBuildArtifactsDir(cloneDir);
    if (existsSync(buildArtifactsDir)) {
        banner(`Cleaning previous build artifacts`);
        await exec('rm', ['-rf', buildArtifactsDir], { label: 'rm -rf artifacts' });
    }

    // Step 1: Build runtime + libs
    // Do NOT override ArtifactsDir — the runtime's build system generates files
    // (e.g. mintops.ts) with paths relative to the default artifacts location.
    banner(`Build runtime: ${flavor} (${subset})`);
    const buildArgs = isWin
        ? ['/c', buildScript, subset, '-os', 'browser', '-arch', 'wasm', '-c', 'Release']
        : [buildScript, subset, '-os', 'browser', '-arch', 'wasm', '-c', 'Release'];

    await exec(shell, buildArgs, { cwd: cloneDir, label: `build ${subset}` });

    // Step 2: Build packs (only needed for mono; clr+libs already produces the nupkg)
    if (flavor === 'mono') {
        banner(`Build packs: ${flavor}`);
        const packArgs = isWin
            ? ['/c', buildScript, 'packs.product', '-os', 'browser', '-arch', 'wasm', '-c', 'Release']
            : [buildScript, 'packs.product', '-os', 'browser', '-arch', 'wasm', '-c', 'Release'];

        await exec(shell, packArgs, { cwd: cloneDir, label: `build packs.product (${flavor})` });
    }
}

// ── Extract nupkg ────────────────────────────────────────────────────────────

async function extractNupkg(nupkgPath: string, extractDir: string): Promise<void> {
    await mkdir(extractDir, { recursive: true });
    // nupkg files are zip archives
    info(`Extracting ${basename(nupkgPath)} to ${extractDir}`);
    try {
        // Try using dotnet tool first (most reliable for nupkg)
        await exec('tar', ['-xf', nupkgPath, '-C', extractDir], {
            label: 'extract nupkg',
            throwOnError: true,
        });
    } catch {
        // Fallback: use unzip on Linux or PowerShell on Windows
        if (process.platform === 'win32') {
            await exec('powershell', [
                '-Command',
                `Expand-Archive -Path '${nupkgPath}' -DestinationPath '${extractDir}' -Force`,
            ], { label: 'extract nupkg (PowerShell)' });
        } else {
            await exec('unzip', ['-o', nupkgPath, '-d', extractDir], {
                label: 'extract nupkg (unzip)',
            });
        }
    }
}

// ── Stage Entry Point ────────────────────────────────────────────────────────

export async function run(ctx: BenchContext): Promise<BenchContext> {
    banner('Build Runtime');

    if (!ctx.runtimeBuildRequired) {
        info('Runtime build not required — skipping');
        return ctx;
    }

    if (!ctx.runtimeCommit) {
        throw new Error('build-runtime stage requires ctx.runtimeCommit');
    }
    if (!ctx.sdkInfo) {
        throw new Error('build-runtime stage requires ctx.sdkInfo (run resolve-sdk first)');
    }

    const { runtimeCommit, runtimeRepo, artifactsDir, platform } = ctx;

    info(`Runtime repo: ${runtimeRepo}`);
    info(`Runtime commit: ${runtimeCommit.slice(0, 10)}`);

    // ── Step 1: Check for pre-built runtime packs (CI artifact download) ──
    let hasPrebuiltPacks = false;
    const prebuiltPackDirs: Partial<Record<Runtime, string>> = {};
    for (const runtime of ctx.runtimes) {
        if (runtime === Runtime.NativeAOTLLVM) continue;
        const flavor = runtime === Runtime.CoreCLR ? 'coreclr' : 'mono';
        const prebuiltDir = getExtractDir(artifactsDir, flavor);
        if (existsSync(prebuiltDir)) {
            info(`Found pre-built ${flavor} runtime pack at ${prebuiltDir}`);
            prebuiltPackDirs[runtime] = prebuiltDir;
            hasPrebuiltPacks = true;
        }
    }

    if (hasPrebuiltPacks && Object.keys(prebuiltPackDirs).length >= ctx.runtimes.filter(r => r !== Runtime.NativeAOTLLVM).length) {
        info('All runtime packs found as pre-built artifacts — skipping build');

        // Detect version from pack contents
        for (const [_runtime, packDir] of Object.entries(prebuiltPackDirs)) {
            const versionFile = join(packDir, '.version');
            if (existsSync(versionFile)) {
                info(`Pack version file found at ${versionFile}`);
            }
        }

        const buildLabel = `${ctx.sdkInfo.sdkVersion}_${runtimeCommit.slice(0, 10)}`;
        return {
            ...ctx,
            runtimePackDirs: prebuiltPackDirs,
            buildLabel,
        };
    }

    // ── Step 2: Clone runtime repo ───────────────────────────────────────
    const cloneDir = getRuntimeCloneDir(artifactsDir);
    await cloneRuntime(runtimeRepo, runtimeCommit, cloneDir);

    // Prevent runtime's eslint from walking up to the workspace root
    const eslintSentinel = join(cloneDir, '.eslintrc.cjs');
    if (!existsSync(eslintSentinel)) {
        await writeFile(eslintSentinel, 'module.exports = { root: true };\n');
    }

    // ── Step 3: Build each requested flavor ──────────────────────────────
    const runtimePackDirs: Partial<Record<Runtime, string>> = ctx.runtimePackDirs ?? {};
    let runtimePackVersion = ctx.sdkInfo.runtimePackVersion;

    for (const runtime of ctx.runtimes) {
        if (runtime === Runtime.NativeAOTLLVM) {
            info(`Skipping NativeAOTLLVM — not supported for custom builds`);
            continue;
        }

        const flavor = runtime === Runtime.CoreCLR ? 'coreclr' : 'mono';
        const buildArtifactsDir = getBuildArtifactsDir(cloneDir);

        // Build
        await buildFlavor(cloneDir, flavor, platform);

        // Find nupkg
        const shippingDir = join(buildArtifactsDir, 'packages', 'Release', 'Shipping');
        const packPrefix = runtime === Runtime.CoreCLR
            ? CORECLR_RUNTIME_PACK_GLOB
            : MONO_RUNTIME_PACK_GLOB;

        const nupkgPath = await findNupkg(shippingDir, packPrefix);
        if (!nupkgPath) {
            // Also try the non-shipping dir
            const nonShippingDir = join(buildArtifactsDir, 'packages', 'Release', 'NonShipping');
            const altPath = await findNupkg(nonShippingDir, packPrefix);
            if (!altPath) {
                throw new Error(
                    `Runtime pack nupkg not found for ${flavor}.\n`
                    + `Searched: ${shippingDir}\n`
                    + `Expected prefix: ${packPrefix}`,
                );
            }
        }

        const foundNupkg = nupkgPath ?? (await findNupkg(
            join(buildArtifactsDir, 'packages', 'Release', 'NonShipping'), packPrefix,
        ))!;

        // Parse version from nupkg filename
        const version = parseVersionFromNupkg(foundNupkg, packPrefix);
        info(`Built ${flavor} runtime pack: ${version}`);
        runtimePackVersion = version;

        // Extract
        const extractDir = getExtractDir(artifactsDir, flavor);
        await extractNupkg(foundNupkg, extractDir);
        runtimePackDirs[runtime] = extractDir;

        info(`Runtime pack for ${runtime}: ${extractDir}`);
    }

    // ── Step 4: Update context ───────────────────────────────────────────
    const updatedSdkInfo = {
        ...ctx.sdkInfo,
        runtimePackVersion,
    };

    const buildLabel = `${ctx.sdkInfo.sdkVersion}_${runtimeCommit.slice(0, 10)}`;

    return {
        ...ctx,
        sdkInfo: updatedSdkInfo,
        runtimePackDirs,
        buildLabel,
    };
}
