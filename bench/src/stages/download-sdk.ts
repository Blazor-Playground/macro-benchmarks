import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { type BenchContext, type SdkInfo } from '../context.js';
import { exec } from '../exec.js';
import { banner, info } from '../log.js';

// ── Constants ────────────────────────────────────────────────────────────────

const DAILY_AZURE_FEED = 'https://ci.dot.net/public';
const INSTALL_SCRIPT_PS1 = 'https://dot.net/v1/dotnet-install.ps1';
const INSTALL_SCRIPT_SH = 'https://dot.net/v1/dotnet-install.sh';
const RUNTIME_PACK_ID = 'microsoft.netcore.app.runtime.mono.browser-wasm';

// ── SDK Installation via dotnet-install scripts ──────────────────────────────

async function downloadInstallScript(platform: string): Promise<string> {
    const isWin = platform === 'windows';
    const url = isWin ? INSTALL_SCRIPT_PS1 : INSTALL_SCRIPT_SH;
    const scriptPath = join(tmpdir(), isWin ? 'dotnet-install.ps1' : 'dotnet-install.sh');

    const resp = await fetch(url);
    if (!resp.ok) {
        throw new Error(`Failed to download dotnet-install script from ${url}: HTTP ${resp.status}`);
    }
    await writeFile(scriptPath, await resp.text(), 'utf-8');

    if (!isWin) {
        await chmod(scriptPath, 0o755);
    }

    return scriptPath;
}

async function installSdk(
    sdkInfo: SdkInfo,
    sdkDir: string,
    platform: string,
): Promise<void> {
    await mkdir(sdkDir, { recursive: true });
    const scriptPath = await downloadInstallScript(platform);
    info(`Install script: ${scriptPath}`);

    if (platform === 'windows') {
        const args = [
            '-ExecutionPolicy', 'Bypass',
            '-File', scriptPath,
            '-Version', sdkInfo.sdkVersion,
            '-InstallDir', sdkDir,
        ];
        if (sdkInfo.isPrerelease) {
            args.push('-AzureFeed', DAILY_AZURE_FEED);
        }
        await exec('powershell', args, { label: 'dotnet-install.ps1' });
    } else {
        const args = [
            scriptPath,
            '--version', sdkInfo.sdkVersion,
            '--install-dir', sdkDir,
        ];
        if (sdkInfo.isPrerelease) {
            args.push('--azure-feed', DAILY_AZURE_FEED);
        }
        await exec('bash', args, { label: 'dotnet-install.sh' });
    }
}

// ── Bundled Version Detection ────────────────────────────────────────────────

async function detectBundledRuntimeVersion(sdkDir: string, sdkInfo: SdkInfo): Promise<string> {
    const propsPath = join(sdkDir, 'sdk', sdkInfo.sdkVersion, 'Microsoft.NETCoreSdk.BundledVersions.props');
    if (!existsSync(propsPath)) {
        throw new Error(`BundledVersions.props not found at ${propsPath}`);
    }
    const content = await readFile(propsPath, 'utf-8');
    const match = content.match(/<BundledNETCoreAppPackageVersion>([^<]+)<\/BundledNETCoreAppPackageVersion>/);
    if (!match) {
        throw new Error('Could not parse BundledNETCoreAppPackageVersion from BundledVersions.props');
    }
    return match[1];
}

// ── Runtime Pack Restore ─────────────────────────────────────────────────────

async function restoreRuntimePack(
    dotnetBin: string,
    repoRoot: string,
    artifactsDir: string,
    runtimePackVersion: string,
): Promise<string> {
    const nugetPackagesDir = join(artifactsDir, 'nuget-packages');
    await mkdir(nugetPackagesDir, { recursive: true });

    const restoreProj = join(repoRoot, 'src', 'restore', 'restore-runtime-pack.proj');
    await exec(dotnetBin, [
        'restore', restoreProj,
        `/p:RuntimePackVersion=${runtimePackVersion}`,
        '--packages', nugetPackagesDir,
    ], {
        cwd: repoRoot,
        label: 'restore runtime pack',
        suppressStdout: true,
    });

    const packDir = join(nugetPackagesDir, RUNTIME_PACK_ID, runtimePackVersion);
    if (!existsSync(packDir)) {
        throw new Error(
            `Runtime pack not found after restore at: ${packDir}\n`
            + `Package: ${RUNTIME_PACK_ID} ${runtimePackVersion}`,
        );
    }

    return packDir;
}

// ── Stage Entry Point ────────────────────────────────────────────────────────

export async function run(ctx: BenchContext): Promise<BenchContext> {
    banner('Download SDK');

    if (!ctx.sdkInfo) throw new Error('download-sdk stage requires ctx.sdkInfo (run resolve-sdk first)');

    const { sdkInfo, sdkDir, dotnetBin, platform } = ctx;

    info(`SDK: ${sdkInfo.sdkVersion} (${sdkInfo.isPrerelease ? 'prerelease' : 'release'})`);
    info(`Runtime pack: ${sdkInfo.runtimePackVersion}`);

    // ── Step 1: Check cache ──────────────────────────────────────────────
    const sdkInfoPath = join(sdkDir, 'sdk-info.json');
    let skipInstall = false;
    if (existsSync(sdkInfoPath) && existsSync(dotnetBin)) {
        const existing = JSON.parse(await readFile(sdkInfoPath, 'utf-8')) as SdkInfo;
        if (existing.sdkVersion === sdkInfo.sdkVersion) {
            info(`SDK ${sdkInfo.sdkVersion} already installed — skipping download`);
            skipInstall = true;
        }
    }

    // ── Step 2: Install SDK ──────────────────────────────────────────────
    if (!skipInstall) {
        info(`Installing SDK ${sdkInfo.sdkVersion}...`);
        await installSdk(sdkInfo, sdkDir, platform);
        info(`SDK installed to ${sdkDir}`);
    }

    // ── Step 3: Detect bundled runtime version ───────────────────────────
    const bundledVersion = await detectBundledRuntimeVersion(sdkDir, sdkInfo);
    info(`Bundled runtime pack: ${bundledVersion}`);

    // ── Step 4: Runtime pack override ────────────────────────────────────
    let runtimePackDir: string | undefined;
    if (sdkInfo.runtimePackVersion !== bundledVersion) {
        info(`Runtime pack override: ${sdkInfo.runtimePackVersion} (bundled: ${bundledVersion})`);
        runtimePackDir = await restoreRuntimePack(
            dotnetBin, ctx.repoRoot, ctx.artifactsDir, sdkInfo.runtimePackVersion,
        );
        info(`Runtime pack restored to ${runtimePackDir}`);
    } else {
        info('Runtime pack matches bundled — no override needed');
    }

    // ── Step 5: Write sdk-info.json ──────────────────────────────────────
    await mkdir(sdkDir, { recursive: true });
    await writeFile(sdkInfoPath, JSON.stringify(sdkInfo, null, 2) + '\n');
    info(`SDK info written to ${sdkInfoPath}`);

    // ── Step 6: Update context ───────────────────────────────────────────
    const buildLabel = runtimePackDir
        ? `${sdkInfo.sdkVersion}_${sdkInfo.runtimePackVersion}`
        : sdkInfo.sdkVersion;

    return {
        ...ctx,
        buildLabel,
        runtimePackDir,
    };
}
