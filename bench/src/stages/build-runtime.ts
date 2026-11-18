import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { getRuntimeSource, type BenchContext, type RuntimeSourceInfo, type RuntimeSources } from '../context.js';
import { Runtime } from '../enums.js';
import { exec } from '../exec.js';
import { banner, info } from '../log.js';
import { findNupkg, parseVersionFromNupkg } from '../lib/package-utils.js';
// ── Constants ────────────────────────────────────────────────────────────────

const MONO_RUNTIME_PACK_GLOB = 'Microsoft.NETCore.App.Runtime.Mono.browser-wasm';
const CORECLR_RUNTIME_PACK_GLOB = 'Microsoft.NETCore.App.Runtime.browser-wasm';
const WEBASSEMBLY_SDK_PACK_ID = 'Microsoft.NET.Sdk.WebAssembly.Pack';
const SOURCE_RECORD = 'benchmark-source.json';

export function validateRuntimePackSource(value: unknown, source: RuntimeSourceInfo): string {
    if (!value || typeof value !== 'object'
        || !('repo' in value) || value.repo !== source.repo
        || !('ref' in value) || value.ref !== source.ref
        || !('commit' in value) || value.commit !== source.commit
        || !('runtimePackVersion' in value) || typeof value.runtimePackVersion !== 'string'
        || !value.runtimePackVersion) {
        throw new Error(`Runtime pack does not match ${source.repo}@${source.commit}; rebuild or download the matching pack.`);
    }
    return value.runtimePackVersion;
}

async function sourceRecord(directory: string, source: RuntimeSourceInfo): Promise<string> {
    let text: string;
    try { text = await readFile(join(directory, SOURCE_RECORD), 'utf8'); }
    catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
        throw new Error(`Missing source record in ${directory}; rebuild the matching runtime.`, { cause: error });
    }
    return validateRuntimePackSource(JSON.parse(text), source);
}

async function prebuiltSources(ctx: BenchContext, packs: Partial<Record<Runtime, string>>): Promise<RuntimeSources | undefined> {
    if (!ctx.sdkInfo.runtimeSources) return undefined;
    const sources = { ...ctx.sdkInfo.runtimeSources };
    for (const runtime of [Runtime.Mono, Runtime.CoreCLR] as const) {
        const source = sources[runtime];
        const directory = packs[runtime];
        if (!source || !directory) continue;
        sources[runtime] = { ...source, runtimePackVersion: await sourceRecord(directory, source) };
    }
    return sources;
}

// ── R2R artifact capture ─────────────────────────────────────────────────────

// Locate the host crossgen2 (emits browser-wasm R2R images) and the built WebAssembly SDK pack
// (carries the CoreCLR R2R targets). These are consumed by build.ts for the CoreCLR `aot` preset.
async function captureR2RArtifacts(ctx: BenchContext): Promise<Pick<BenchContext, 'crossgen2Dir' | 'runtimePackagesDir' | 'r2rPackVersion'>> {
    const result: Pick<BenchContext, 'crossgen2Dir' | 'runtimePackagesDir' | 'r2rPackVersion'> = {};
    if (!ctx.runtimes.includes(Runtime.CoreCLR)) return result;
    const cloneDir = getSourceCloneDir(ctx, Runtime.CoreCLR);
    const r2rRoot = join(cloneDir, 'artifacts', 'bin', 'coreclr', 'browser.wasm.Release');
    const shippingDir = join(cloneDir, 'artifacts', 'packages', 'Release', 'Shipping');
    const source = getRuntimeSource(ctx.sdkInfo, Runtime.CoreCLR);
    if (source && (existsSync(r2rRoot) || existsSync(shippingDir))) {
        await sourceRecord(getBuildArtifactsDir(cloneDir), source);
    }
    if (existsSync(r2rRoot)) {
        for (const arch of ['x64', 'arm64', 'x86']) {
            const cg = join(r2rRoot, arch, 'crossgen2');
            if (existsSync(cg)) { result.crossgen2Dir = cg; break; }
        }
    }
    if (existsSync(shippingDir)) {
        const packNupkg = await findNupkg(shippingDir, WEBASSEMBLY_SDK_PACK_ID);
        if (packNupkg) {
            result.runtimePackagesDir = shippingDir;
            result.r2rPackVersion = parseVersionFromNupkg(packNupkg, WEBASSEMBLY_SDK_PACK_ID);
        }
    }
    return result;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRuntimeCloneDir(artifactsDir: string, flavor?: 'mono' | 'coreclr'): string {
    return join(artifactsDir, flavor ? `runtime-src-${flavor}` : 'runtime-src');
}

function getBuildArtifactsDir(cloneDir: string): string {
    return join(cloneDir, 'artifacts');
}

function getExtractDir(artifactsDir: string, flavor: 'mono' | 'coreclr'): string {
    return join(artifactsDir, `runtime-pack-${flavor}`);
}

function getSourceCloneDir(ctx: BenchContext, runtime: Runtime): string {
    const source = getRuntimeSource(ctx.sdkInfo, runtime);
    if (!source) return getRuntimeCloneDir(ctx.artifactsDir);
    return getRuntimeCloneDir(
        ctx.artifactsDir,
        runtime === Runtime.CoreCLR ? 'coreclr' : 'mono',
    );
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
        await rm(buildArtifactsDir, { recursive: true, force: true });
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

        const sources = await prebuiltSources(ctx, prebuiltPackDirs);
        const buildLabel = `${ctx.sdkInfo.sdkVersion}_${runtimeCommit.slice(0, 10)}`;
        const r2r = await captureR2RArtifacts(ctx);
        return {
            ...ctx,
            sdkInfo: {
                ...ctx.sdkInfo,
                ...(sources ? {
                    runtimeSources: sources,
                    runtimePackVersion: sources.coreclr?.runtimePackVersion ?? ctx.sdkInfo.runtimePackVersion,
                } : {}),
            },
            runtimePackDirs: prebuiltPackDirs,
            buildLabel,
            ...r2r,
        };
    }

    // ── Step 2: Build each requested flavor ──────────────────────────────
    const runtimePackDirs: Partial<Record<Runtime, string>> = ctx.runtimePackDirs ?? {};
    let runtimePackVersion = ctx.sdkInfo.runtimePackVersion;
    let runtimeSources: RuntimeSources | undefined = ctx.sdkInfo.runtimeSources;

    for (const runtime of ctx.runtimes) {
        if (runtime === Runtime.NativeAOTLLVM) {
            info(`Skipping NativeAOTLLVM — not supported for custom builds`);
            continue;
        }

        const flavor = runtime === Runtime.CoreCLR ? 'coreclr' : 'mono';
        const source = getRuntimeSource(ctx.sdkInfo, runtime);
        const sourceRepo = source?.repo ?? runtimeRepo;
        const sourceCommit = source?.commit ?? runtimeCommit;
        if (!sourceCommit) {
            throw new Error(`No source commit resolved for ${flavor}`);
        }
        const cloneDir = getSourceCloneDir(ctx, runtime);
        info(`${flavor} source: ${sourceRepo}@${sourceCommit.slice(0, 10)}${source ? ` (${source.ref})` : ''}`);
        await cloneRuntime(sourceRepo, sourceCommit, cloneDir);

        // Prevent runtime's eslint from walking up to the workspace root
        const eslintSentinel = join(cloneDir, '.eslintrc.cjs');
        if (!existsSync(eslintSentinel)) {
            await writeFile(eslintSentinel, 'module.exports = { root: true };\n');
        }

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
        if (source) {
            await writeFile(join(buildArtifactsDir, SOURCE_RECORD), JSON.stringify({
                repo: source.repo, ref: source.ref, commit: source.commit, runtimePackVersion: version,
            }) + '\n');
            runtimeSources = {
                ...runtimeSources,
                [runtime]: {
                    ...source,
                    runtimePackVersion: version,
                },
            };
        }

        // Extract
        const extractDir = getExtractDir(artifactsDir, flavor);
        await rm(extractDir, { recursive: true, force: true });
        await extractNupkg(foundNupkg, extractDir);
        if (source) {
            await writeFile(join(extractDir, SOURCE_RECORD), JSON.stringify({
                repo: source.repo, ref: source.ref, commit: source.commit, runtimePackVersion: version,
            }) + '\n');
        }
        runtimePackDirs[runtime] = extractDir;

        info(`Runtime pack for ${runtime}: ${extractDir}`);
    }

    // ── Step 3: Update context ───────────────────────────────────────────
    const updatedSdkInfo = {
        ...ctx.sdkInfo,
        runtimePackVersion: runtimeSources?.coreclr?.runtimePackVersion ?? runtimePackVersion,
        ...(runtimeSources ? { runtimeSources } : {}),
    };

    const buildLabel = `${ctx.sdkInfo.sdkVersion}_${runtimeCommit.slice(0, 10)}`;
    const r2r = await captureR2RArtifacts({ ...ctx, sdkInfo: updatedSdkInfo });

    return {
        ...ctx,
        sdkInfo: updatedSdkInfo,
        runtimePackDirs,
        buildLabel,
        ...r2r,
    };
}
