import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { type App, type Engine, type Preset, type Profile, type Runtime, type Stage } from './enums.js';

// ── SDK Info (populated by resolve-sdk stage) ───────────────────────────────

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
    runtimeCommitDateTime: string;
    runtimeCommitAuthor: string;
    runtimeCommitMessage: string;
    aspnetCoreCommitDateTime: string;
    aspnetCoreVersion: string;
    runtimePackVersion: string;
    workloadVersion: string;
    bootstrapSdkVersion: string;
    releaseDate: string;
}

// ── Build Manifest Entry (populated by build stage) ──────────────────────────

export interface BuildManifestEntry {
    app: App;
    preset: Preset;
    runtime: Runtime;
    compileTimeMs: number;
    integrity: { fileCount: number; totalBytes: number };
    publishDir: string;
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
    runtime: Runtime;
    runtimePack: string;
    runtimeCommit: string;

    // ── Filters ──
    apps: App[];
    presets: Preset[];
    engines: Engine[];
    profiles: Profile[];

    // ── Measurement ──
    retries: number;
    timeout: number;
    warmRuns: number;
    headless: boolean;

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

    // ── Resolved paths (populated during execution) ──
    repoRoot: string;
    artifactsDir: string;
    sdkDir: string;
    dotnetBin: string;
    runtimePackDir?: string;
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
