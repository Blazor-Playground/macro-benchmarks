import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import {
    type BenchContext,
    type RuntimeSourceInfo,
    type RuntimeSources,
    type SdkInfo,
    recordRuntimeSdk,
} from '../context.js';
import { Runtime } from '../enums.js';
import { banner, info } from '../log.js';
import { compareVersions, getVersionMajor, populateVersionFields } from '../lib/version-utils.js';
import {
    fetchGitHubCommitInfo,
    fetchGitHubCommitMetadata,
    fetchJson,
    githubHeaders,
    resolveGitHubToken,
    GITHUB_API,
} from '../lib/http.js';
import { updateBuildLock } from '../lib/build-lock.js';
import { monoPackAvailable } from '../lib/debug-sdk.js';

// ── Types ────────────────────────────────────────────────────────────────────

export const MONO_RUNTIME_REPO = 'dotnet/runtime';
export const MONO_RUNTIME_REF = 'release/11.0';

interface TaggedPack {
    entry: SdkInfo;
    source: 'daily' | 'release';
}

export interface RuntimeSourceSelection {
    repo: string;
    ref: string;
    commitish?: string;
}

export type SourceBuiltRuntimeSources = RuntimeSources & {
    [Runtime.Mono]: RuntimeSourceInfo;
    [Runtime.CoreCLR]: RuntimeSourceInfo;
};

export type RuntimeSourceResolver = (
    selection: RuntimeSourceSelection,
) => Promise<RuntimeSourceInfo>;

// ── Pack list loading ────────────────────────────────────────────────────────

async function loadPacks(artifactsDir: string): Promise<TaggedPack[]> {
    const result: TaggedPack[] = [];

    const dailyPath = join(artifactsDir, 'daily-packs-list.json');
    if (existsSync(dailyPath)) {
        const data = JSON.parse(await readFile(dailyPath, 'utf-8')) as { packs: SdkInfo[] };
        for (const entry of data.packs) {
            result.push({ entry, source: 'daily' });
        }
    }

    const releasePath = join(artifactsDir, 'release-packs-list.json');
    if (existsSync(releasePath)) {
        const data = JSON.parse(await readFile(releasePath, 'utf-8')) as { packs: SdkInfo[] };
        for (const entry of data.packs) {
            result.push({ entry, source: 'release' });
        }
    }

    if (result.length === 0) {
        throw new Error(
            'No pack catalogs found. Run enumerate stages first:\n'
            + '  bench --stages enumerate-daily-packs,enumerate-release-packs',
        );
    }

    return result;
}

// ── Target resolution ────────────────────────────────────────────────────────

interface ResolvedTarget {
    /** Pack entry for the runtime being tested */
    runtimeEntry: TaggedPack;
    /** Pack entry for the SDK to install (may equal runtimeEntry) */
    sdkEntry: TaggedPack;
}

function resolveTarget(ctx: BenchContext, packs: TaggedPack[]): ResolvedTarget {
    let runtimeTarget: TaggedPack | undefined;
    let sdkTarget: TaggedPack | undefined;

    if (ctx.runtimeCommit && ctx.runtimePack) {
        throw new Error('Cannot specify both --runtime-commit and --runtime-pack');
    }

    // ── Resolve runtime target ───────────────────────────────────────────

    if (ctx.runtimeCommit) {
        const hash = ctx.runtimeCommit;
        const matches = packs.filter(p => p.entry.runtimeGitHash.startsWith(hash));
        if (matches.length === 0) {
            // Commit not in catalog — will build from source
            info(`Runtime commit '${hash}' not found in pack catalogs`);
        } else {
            // First match = latest (lists are sorted newest-first)
            runtimeTarget = matches[0];
        }
    }

    if (ctx.runtimePack) {
        const ver = ctx.runtimePack;
        const match = packs.find(p => p.entry.runtimePackVersion === ver);
        if (!match) {
            throw new Error(
                `Runtime pack version '${ver}' not found in pack catalogs.\n`
                + 'Run enumerate stages to refresh:\n'
                + '  bench --stages enumerate-daily-packs,enumerate-release-packs',
            );
        }
        runtimeTarget = match;
    }

    // ── Resolve SDK target ───────────────────────────────────────────────

    if (ctx.sdkVersion) {
        const ver = ctx.sdkVersion;
        const match = packs.find(p => p.entry.sdkVersion === ver);
        if (!match) {
            throw new Error(
                `SDK version '${ver}' not found in pack catalogs.\n`
                + 'Run enumerate stages to refresh:\n'
                + '  bench --stages enumerate-daily-packs,enumerate-release-packs',
            );
        }
        sdkTarget = match;
    } else if (runtimeTarget) {
        sdkTarget = runtimeTarget;
    } else {
        // Latest for channel
        const channelMajor = getVersionMajor(ctx.sdkChannel);
        const match = packs.find(p => {
            return getVersionMajor(p.entry.sdkVersion) === channelMajor;
        });
        if (!match) {
            throw new Error(
                `No SDK found for channel '${ctx.sdkChannel}' in pack catalogs.\n`
                + 'Run enumerate stages first:\n'
                + '  bench --stages enumerate-daily-packs,enumerate-release-packs',
            );
        }
        sdkTarget = match;
    }

    return {
        runtimeEntry: runtimeTarget ?? sdkTarget,
        sdkEntry: sdkTarget,
    };
}

// ── PR Resolution ────────────────────────────────────────────────────────────

interface GitHubPR {
    head: {
        sha: string;
        ref: string;
        repo: { full_name: string } | null;
    };
    title: string;
    user: { login: string } | null;
}

async function resolveRuntimePR(prNumber: string): Promise<{
    runtimeCommit: string;
    runtimeRepo: string;
    branchName: string;
    prTitle: string;
    prAuthor: string;
}> {
    const token = await resolveGitHubToken();
    const headers = githubHeaders(token);
    const pr = await fetchJson<GitHubPR>(
        `${GITHUB_API}/repos/dotnet/runtime/pulls/${prNumber}`, headers,
    );
    if (!pr) {
        throw new Error(`Could not fetch PR #${prNumber} from dotnet/runtime`);
    }
    if (!pr.head.repo) {
        throw new Error(`PR #${prNumber} head repo is null (fork may have been deleted)`);
    }
    return {
        runtimeCommit: pr.head.sha,
        runtimeRepo: pr.head.repo.full_name,
        branchName: pr.head.ref,
        prTitle: pr.title,
        prAuthor: pr.user?.login ?? 'unknown',
    };
}

async function resolveAspNetCorePR(prNumber: string): Promise<{
    aspnetCoreCommit: string;
    aspnetCoreRepo: string;
    branchName: string;
    prTitle: string;
    prAuthor: string;
}> {
    const token = await resolveGitHubToken();
    const headers = githubHeaders(token);
    const pr = await fetchJson<GitHubPR>(
        `${GITHUB_API}/repos/dotnet/aspnetcore/pulls/${prNumber}`, headers,
    );
    if (!pr) {
        throw new Error(`Could not fetch PR #${prNumber} from dotnet/aspnetcore`);
    }
    if (!pr.head.repo) {
        throw new Error(`PR #${prNumber} head repo is null (fork may have been deleted)`);
    }
    return {
        aspnetCoreCommit: pr.head.sha,
        aspnetCoreRepo: pr.head.repo.full_name,
        branchName: pr.head.ref,
        prTitle: pr.title,
        prAuthor: pr.user?.login ?? 'unknown',
    };
}

async function fetchCommitMetadata(repo: string, sha: string): Promise<{
    commitDateTime: string;
    commitAuthor: string;
    commitMessage: string;
}> {
    const token = await resolveGitHubToken();
    const data = await fetchGitHubCommitMetadata(repo, sha, token);
    if (!data) {
        throw new Error(`Could not fetch commit '${sha}' from ${repo}`);
    }
    return data;
}

export async function resolveRuntimeSource(
    selection: RuntimeSourceSelection,
): Promise<RuntimeSourceInfo> {
    const token = await resolveGitHubToken();
    const commitish = selection.commitish ?? selection.ref;
    const data = await fetchGitHubCommitInfo(selection.repo, commitish, token);
    if (!data) {
        throw new Error(`Could not resolve runtime ref '${commitish}' from ${selection.repo}`);
    }
    return {
        repo: selection.repo,
        ref: selection.ref,
        commit: data.sha,
        committedAt: data.commitDateTime,
        commitAuthor: data.commitAuthor,
        commitMessage: data.commitMessage,
    };
}

function validateRuntimeSource(source: RuntimeSourceInfo, label: string): void {
    if (!/^[0-9a-f]{40}$/i.test(source.commit)) {
        throw new Error(`${label} runtime source did not resolve to a full 40-character commit`);
    }
    if (!source.repo || !source.ref || !source.committedAt) {
        throw new Error(`${label} runtime source is missing repository, ref, or commit time`);
    }
}

export async function resolveSourceBuiltRuntimeSources(
    coreclrSelection: RuntimeSourceSelection,
    resolver: RuntimeSourceResolver = resolveRuntimeSource,
): Promise<SourceBuiltRuntimeSources> {
    const [coreclr, mono] = await Promise.all([
        resolver(coreclrSelection),
        resolver({ repo: MONO_RUNTIME_REPO, ref: MONO_RUNTIME_REF }),
    ]);
    validateRuntimeSource(coreclr, 'CoreCLR');
    validateRuntimeSource(mono, 'Mono');
    return {
        [Runtime.CoreCLR]: coreclr,
        [Runtime.Mono]: mono,
    };
}

// ── Stage Entry Point ────────────────────────────────────────────────────────

export async function run(ctx: BenchContext): Promise<BenchContext> {
    banner('Resolve SDK');

    // ── Step 0: Resolve --runtime-pr to commit + repo ────────────────────
    if (ctx.runtimePR) {
        if (ctx.runtimeCommit) {
            throw new Error('Cannot specify both --runtime-pr and --runtime-commit');
        }
        info(`Resolving PR #${ctx.runtimePR}...`);
        const pr = await resolveRuntimePR(ctx.runtimePR);
        info(`PR #${ctx.runtimePR}: ${pr.prTitle}`);
        info(`  repo: ${pr.runtimeRepo}, branch: ${pr.branchName}`);
        info(`  head commit: ${pr.runtimeCommit.slice(0, 10)}`);
        ctx = {
            ...ctx,
            runtimeCommit: pr.runtimeCommit,
            runtimeRepo: pr.runtimeRepo,
            runtimeRef: pr.branchName,
        };
    }

    // ── Step 0b: Resolve --aspnetcore-pr to commit + repo ────────────────
    if (ctx.aspnetCorePR) {
        if (ctx.aspnetCoreCommit) {
            throw new Error('Cannot specify both --aspnetcore-pr and --aspnetcore-commit');
        }
        info(`Resolving ASP.NET Core PR #${ctx.aspnetCorePR}...`);
        const pr = await resolveAspNetCorePR(ctx.aspnetCorePR);
        info(`PR #${ctx.aspnetCorePR}: ${pr.prTitle}`);
        info(`  repo: ${pr.aspnetCoreRepo}, branch: ${pr.branchName}`);
        info(`  head commit: ${pr.aspnetCoreCommit.slice(0, 10)}`);
        ctx = { ...ctx, aspnetCoreCommit: pr.aspnetCoreCommit, aspnetCoreRepo: pr.aspnetCoreRepo };
    }

    // ── Step 0c: Mark runtime build required ─────────────────────────────
    let runtimeMeta: { commitDateTime: string; commitAuthor: string; commitMessage: string } | undefined;
    let runtimeSources: SourceBuiltRuntimeSources | undefined;
    if (ctx.runtimeCommit) {
        const coreclrSelection = {
            repo: ctx.runtimeRepo,
            ref: ctx.runtimeRef || ctx.runtimeCommit,
            commitish: ctx.runtimeCommit,
        };
        info(`CoreCLR runtime selected: ${coreclrSelection.ref} (${ctx.runtimeRepo})`);
        info(`Mono runtime baseline: ${MONO_RUNTIME_REF} (${MONO_RUNTIME_REPO})`);
        runtimeSources = await resolveSourceBuiltRuntimeSources(coreclrSelection);
        const coreclrSource = runtimeSources[Runtime.CoreCLR];
        const monoSource = runtimeSources[Runtime.Mono];
        ctx = {
            ...ctx,
            runtimeCommit: coreclrSource.commit,
            runtimeRef: coreclrSource.ref,
            runtimeBuildRequired: true,
        };
        runtimeMeta = {
            commitDateTime: coreclrSource.committedAt,
            commitAuthor: coreclrSource.commitAuthor,
            commitMessage: coreclrSource.commitMessage,
        };
        info(`CoreCLR source pin: ${coreclrSource.commit.slice(0, 10)} (${coreclrSource.ref})`);
        info(`Mono source pin: ${monoSource.commit.slice(0, 10)} (${monoSource.ref})`);
    }

    // ── Step 0d: Mark aspnetcore build required ──────────────────────────
    let aspnetCoreMeta: { commitDateTime: string; commitAuthor: string; commitMessage: string } | undefined;
    if (ctx.aspnetCoreCommit) {
        info(`ASP.NET Core commit specified: ${ctx.aspnetCoreCommit.slice(0, 10)} — will build from source`);
        ctx = { ...ctx, aspnetCoreBuildRequired: true };
        info(`Fetching ASP.NET Core commit metadata for ${ctx.aspnetCoreCommit.slice(0, 10)} from ${ctx.aspnetCoreRepo}...`);
        aspnetCoreMeta = await fetchCommitMetadata(ctx.aspnetCoreRepo, ctx.aspnetCoreCommit);
    }

    // ── Step 1: Load pack catalogs ───────────────────────────────────────
    const packs = await loadPacks(ctx.artifactsDir);
    info(`Loaded ${packs.length} pack entries`);

    // ── Step 2: Resolve target ───────────────────────────────────────────
    const { runtimeEntry, sdkEntry } = resolveTarget(ctx, packs);

    const sdkVersion = sdkEntry.entry.sdkVersion;

    // ── Step 3: Build SdkInfo ────────────────────────────────────────────
    const sdkInfo: SdkInfo = populateVersionFields({
        sdkVersion,
        runtimeGitHash: ctx.runtimeBuildRequired ? ctx.runtimeCommit : runtimeEntry.entry.runtimeGitHash,
        aspnetCoreGitHash: ctx.aspnetCoreCommit || sdkEntry.entry.aspnetCoreGitHash,
        sdkGitHash: sdkEntry.entry.sdkGitHash,
        vmrGitHash: sdkEntry.entry.vmrGitHash,
        sdkCommitDateTime: sdkEntry.entry.sdkCommitDateTime,
        vmrCommitDateTime: sdkEntry.entry.vmrCommitDateTime,
        runtimeCommitDateTime: runtimeMeta?.commitDateTime || runtimeEntry.entry.runtimeCommitDateTime,
        runtimeCommitAuthor: runtimeMeta?.commitAuthor || runtimeEntry.entry.runtimeCommitAuthor,
        runtimeCommitMessage: runtimeMeta?.commitMessage || runtimeEntry.entry.runtimeCommitMessage,
        aspnetCoreCommitDateTime: aspnetCoreMeta?.commitDateTime || sdkEntry.entry.aspnetCoreCommitDateTime,
        aspnetCoreCommitAuthor: aspnetCoreMeta?.commitAuthor || sdkEntry.entry.aspnetCoreCommitAuthor,
        aspnetCoreCommitMessage: aspnetCoreMeta?.commitMessage || sdkEntry.entry.aspnetCoreCommitMessage,
        aspnetCoreVersion: sdkEntry.entry.aspnetCoreVersion,
        runtimePackVersion: ctx.runtimeBuildRequired ? sdkEntry.entry.runtimePackVersion : runtimeEntry.entry.runtimePackVersion,
        isRuntimeCustomBuild: ctx.runtimeBuildRequired || undefined,
        runtimePR: ctx.runtimePR || undefined,
        aspnetCorePR: ctx.aspnetCorePR || undefined,
        isAspnetCoreCustomBuild: ctx.aspnetCoreBuildRequired || undefined,
        workloadVersion: sdkEntry.entry.workloadVersion,
        bootstrapSdkVersion: sdkEntry.entry.bootstrapSdkVersion,
        releaseDate: runtimeMeta?.commitDateTime.slice(0, 10) || sdkEntry.entry.releaseDate,
        runtimeSources,
    });
    if (runtimeSources) {
        runtimeSources.coreclr = recordRuntimeSdk(runtimeSources.coreclr, sdkInfo);
        if (ctx.runtimes.includes(Runtime.Mono)) {
            const monoSdk = packs.map(pack => pack.entry)
                .filter(pack => getVersionMajor(pack.sdkVersion) === 11 && !pack.isPrerelease)
                .sort((a, b) => compareVersions(b.sdkVersion, a.sdkVersion))[0];
            if (!monoSdk) throw new Error('Mono release/11.0 source builds require a .NET 11 GA SDK in the pack catalogs.');
            runtimeSources.mono = recordRuntimeSdk(runtimeSources.mono, {
                ...monoSdk, isRuntimeCustomBuild: true,
            });
        }
    }
    if (!ctx.runtimeBuildRequired && !ctx.runtimePack && sdkInfo.major >= 12) {
        sdkInfo.monoRuntimePackAvailable = await monoPackAvailable(sdkInfo.runtimePackVersion);
        info(`Mono runtime pack available: ${sdkInfo.monoRuntimePackAvailable}`);
    }

    info(`SDK: ${sdkVersion} (${sdkEntry.source})`);
    if (ctx.runtimeBuildRequired) {
        info(`Runtime will be built from source: ${ctx.runtimeCommit.slice(0, 10)} (${ctx.runtimeRepo})`);
    } else {
        info(`Runtime pack: ${sdkInfo.runtimePackVersion}`);
    }
    info(`Runtime commit: ${sdkInfo.runtimeGitHash.slice(0, 10)}`);

    // ── Step 4: Detect if this is the latest daily build ─────────────────
    const latestDaily = packs.find(p =>
        p.source === 'daily'
        && getVersionMajor(p.entry.sdkVersion) === sdkInfo.major,
    );
    const isLatestDaily = !ctx.runtimeBuildRequired
        && sdkEntry.source === 'daily'
        && !!latestDaily
        && latestDaily.entry.sdkVersion === sdkVersion;
    if (isLatestDaily) {
        info('This is the latest daily build for the channel');
    }

    // ── Step 5: Compute paths ────────────────────────────────────────────
    const platform = ctx.platform;
    const sdkDirName = `${platform}.sdk${sdkVersion}`;
    const sdkDir = join(ctx.artifactsDir, 'sdks', sdkDirName);
    const dotnetBin = join(sdkDir, platform === 'windows' ? 'dotnet.exe' : 'dotnet');

    // ── Step 6: Build label ──────────────────────────────────────────────
    let buildLabel = sdkVersion;
    if (ctx.runtimeBuildRequired) {
        buildLabel += `_rt-${ctx.runtimeCommit.slice(0, 10)}`;
    }
    if (ctx.aspnetCoreBuildRequired) {
        buildLabel += `_aspnet-${ctx.aspnetCoreCommit.slice(0, 10)}`;
    }

    const result = {
        ...ctx,
        sdkDir,
        dotnetBin,
        sdkInfo,
        isLatestDaily,
        buildLabel,
        publishDir: join(ctx.artifactsDir, 'publish'),
        resultsDir: join(ctx.artifactsDir, 'results'),
    };
    await updateBuildLock(result);
    return result;
}
