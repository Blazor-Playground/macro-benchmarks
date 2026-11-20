import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type App, type Engine, type Preset, type Profile, type Runtime, type Stage } from './enums.js';

// ── SDK Info (populated by resolve-sdk stage) ───────────────────────────────

export interface RuntimeSourceInfo {
    repo: string;
    ref: string;
    commit: string;
    committedAt: string;
    commitAuthor: string;
    commitMessage: string;
    sdkVersion?: string | null;
    targetFramework?: string | null;
    runtimePackVersion?: string | null;
    sdkInfo?: Omit<SdkInfo, 'runtimeSources'>;
}

export type RuntimeSourceFlavor = 'mono' | 'coreclr';
export type RuntimeSources = Partial<Record<RuntimeSourceFlavor, RuntimeSourceInfo>>;

export interface SdkInfo {
    sdkVersion: string;
    major: number;
    minor: number;
    patch: number;
    channel: string;
    isPrerelease: boolean;
    runtimeGitHash: string;
    aspnetCoreGitHash: string;
    sdkGitHash: string;
    vmrGitHash: string;
    sdkCommitDateTime?: string;
    vmrCommitDateTime?: string;
    runtimeCommitDateTime: string;
    runtimeCommitAuthor: string;
    runtimeCommitMessage: string;
    aspnetCoreCommitDateTime: string;
    aspnetCoreCommitAuthor: string;
    aspnetCoreCommitMessage: string;
    aspnetCoreVersion: string;
    runtimePackVersion: string;
    /** Whether the selected Mono pack exists; undefined in older records. */
    monoRuntimePackAvailable?: boolean;
    isRuntimeCustomBuild?: boolean;
    runtimePR?: string;
    aspnetCorePR?: string;
    isAspnetCoreCustomBuild?: boolean;
    workloadVersion: string;
    bootstrapSdkVersion: string;
    releaseDate: string;
    /** Absent on legacy results, where both runtimes use runtimeGitHash. */
    runtimeSources?: RuntimeSources;
    /** dotnet/dotnet branch the VMR build came from (e.g. 'main', 'release/11.0.1xx', 'unknown'). */
    vmrBranch?: string;
    /**
     * TFM the SDK can actually target, from BundledNETCoreAppTargetFrameworkVersion (e.g. 'net11.0').
     * Early in a major this can lag the SDK version (a 12.0.100-alpha SDK still shipping net11.0),
     * so it — not the SDK major — is the correct framework to target (avoids NETSDK1045).
     */
    bundledFrameworkTfm?: string;
}

// ── Build Manifest Entry (populated by build stage) ──────────────────────────

export interface MeasurementEnvironment {
    os: string;
    arch: string;
}

export interface BuildManifestEntry {
    environment?: MeasurementEnvironment;
    app: App;
    preset: Preset;
    runtime: Runtime;
    compileTimeMs: number;
    presetRevision?: string;
    readyToRun?: {
        compilation: 'full' | 'partial-pgo';
        composite: boolean;
        profile?: { package: string; version: string; file: string; sha256: string };
    };
    integrity: { fileCount: number; totalBytes: number };
    publishDir: string;
    runtimeSources?: RuntimeSources;
}

export interface BuildFailureSummary {
    target: string;
    errorLines: string[];
}

export interface BuildShardReport {
    sdkVersion: string;
    apps: App[];
    completedAt: string;
    succeeded: BuildManifestEntry[];
    failures: BuildFailureSummary[];
}

// ── Main Context ─────────────────────────────────────────────────────────────

export interface BenchContext {
    // ── Parsed CLI options ──
    stages: Stage[];
    dryRun: boolean;
    verbose: boolean;

    // ── SDK & Runtime ──
    sdkChannel: string;
    sdkVersion: string;
    runtimePack: string;
    runtimeCommit: string;
    runtimeRepo: string;
    /** Source ref; runtimeCommit is the immutable checkout pin. */
    runtimeRef: string;
    runtimePR: string;
    runtimeBuildRequired: boolean;

    // ── ASP.NET Core ──
    aspnetCoreCommit: string;
    aspnetCorePR: string;
    aspnetCoreRepo: string;
    aspnetCoreBuildRequired: boolean;
    aspnetCorePackagesDir?: string;
    aspnetCorePackageVersion?: string;

    // ── Filters ──
    apps: App[];
    presets: Preset[];
    engines: Engine[];
    profiles: Profile[];
    runtimes: Runtime[];

    // ── Measurement ──
    retries: number;
    timeout: number;
    warmRuns: number;
    coldRuns: number;
    walkthroughRuns: number;
    replica: string;
    deadlineMs: number;
    headless: boolean;
    /** Local experiments can opt into installed Chrome instead of Playwright's pinned Chromium. */
    chromiumChannel?: 'chrome';
    debugRuns?: number;
    debugScenarios?: string[];
    debugDotnet?: string;
    debugMonoDotnet?: string;
    debugMonoSdkInfo?: SdkInfo;
    debugMonoFallback?: { branch: 'release/11.0'; reason: string };
    debugBrowserChannel?: string;
    debugViewsDir?: string;

    // ── Docker ──
    skipDockerBuild: boolean;
    forceDockerBuild: boolean;

    // ── Consolidation ──
    artifactsInputDir?: string;

    // ── Scheduling ──
    maxDispatches: number;
    repo?: string;
    branch: string;

    // ── Enumeration ──
    major: number;
    months: number;
    releaseMajors: number[];
    forceEnumerate: boolean;
    /** Keep only daily packs from this dotnet/dotnet branch ('' = keep all). */
    vmrBranch: string;

    // ── Resolved paths (populated during execution) ──
    repoRoot: string;
    artifactsDir: string;
    sdkDir: string;
    dotnetBin: string;
    runtimePackDirs?: Partial<Record<Runtime, string>>;
    // R2R injection (CoreCLR aot preset): populated by build-runtime when a from-source runtime is built.
    crossgen2Dir?: string;
    runtimePackagesDir?: string;
    r2rPackVersion?: string;
    r2rSettings?: { pgo: boolean; composite: boolean };
    publishDir: string;
    resultsDir: string;
    buildLabel: string;
    runId: string;

    // ── Resolved SDK info (populated by resolve-sdk stage) ──
    sdkInfo: SdkInfo;

    // ── Build manifest (populated by build stage) ──
    buildManifest: BuildManifestEntry[];

    // ── Deploy (populated by resolve-sdk) ──
    isLatestDaily: boolean;

    // ── Environment detection ──
    platform: 'windows' | 'linux' | 'darwin';
    isCI: boolean;
    isDocker: boolean;
    ciRunId?: string;
}

// ── Serialization ────────────────────────────────────────────────────────────

export async function saveContext(ctx: BenchContext, path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(ctx, null, 2), 'utf-8');
}

export async function loadContext(path: string): Promise<BenchContext> {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as BenchContext;
}

export function getRuntimeSource(
    sdkInfo: SdkInfo,
    runtime: Runtime,
): RuntimeSourceInfo | undefined {
    if (runtime !== 'mono' && runtime !== 'coreclr') return undefined;
    return sdkInfo.runtimeSources?.[runtime];
}

/** Select the row's runtime provenance; leave legacy results unchanged. */
export function sdkInfoForRuntime(sdkInfo: SdkInfo, runtime: Runtime): SdkInfo {
    const source = getRuntimeSource(sdkInfo, runtime);
    if (!source) return sdkInfo;

    return {
        ...(source.sdkInfo ?? sdkInfo),
        runtimeSources: sdkInfo.runtimeSources,
        runtimeGitHash: source.commit,
        runtimeCommitDateTime: source.committedAt,
        runtimeCommitAuthor: source.commitAuthor,
        runtimeCommitMessage: source.commitMessage,
        runtimePackVersion: source.runtimePackVersion ?? source.sdkInfo?.runtimePackVersion ?? '',
    };
}

export function recordRuntimeSdk(source: RuntimeSourceInfo, sdkInfo: SdkInfo): RuntimeSourceInfo {
    const { runtimeSources: _sources, ...sdk } = sdkInfo;
    return {
        ...source,
        sdkInfo: sdk,
        sdkVersion: sdk.sdkVersion,
        targetFramework: sdk.bundledFrameworkTfm ?? null,
    };
}

export function runtimeBuildContext(ctx: BenchContext, runtime: Runtime): BenchContext {
    const source = getRuntimeSource(ctx.sdkInfo, runtime);
    if (ctx.runtimeBuildRequired && runtime === 'mono' && source && !source.sdkInfo) {
        throw new Error('Source-built Mono requires its own resolved SDK metadata.');
    }
    const sdkInfo = sdkInfoForRuntime(ctx.sdkInfo, runtime);
    const selected = {
        ...ctx, sdkInfo,
        ...(runtime === 'mono' && source?.sdkInfo ? {
            aspnetCorePackagesDir: undefined, aspnetCorePackageVersion: undefined,
        } : {}),
    };
    if (sdkInfo.sdkVersion === ctx.sdkInfo.sdkVersion) return selected;
    const sdkDir = join(ctx.artifactsDir, 'sdks', `${ctx.platform}.sdk${sdkInfo.sdkVersion}`);
    return {
        ...selected, sdkVersion: sdkInfo.sdkVersion, sdkDir,
        dotnetBin: join(sdkDir, ctx.platform === 'windows' ? 'dotnet.exe' : 'dotnet'),
    };
}

export function sdkInfoForBuild(sdkInfo: SdkInfo, entry: BuildManifestEntry): SdkInfo {
    return sdkInfoForRuntime(
        entry.runtimeSources ? { ...sdkInfo, runtimeSources: entry.runtimeSources } : sdkInfo,
        entry.runtime,
    );
}
