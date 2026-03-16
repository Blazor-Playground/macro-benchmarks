import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { type BenchContext, type SdkInfo } from '../context.js';
import { banner, info } from '../log.js';
import { getVersionMajor, populateVersionFields } from '../lib/version-utils.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface TaggedPack {
    entry: SdkInfo;
    source: 'daily' | 'release';
}

interface ResolvedTarget {
    /** Pack entry for the runtime being tested */
    runtimeEntry: TaggedPack;
    /** Pack entry for the SDK to install (may equal runtimeEntry) */
    sdkEntry: TaggedPack;
}

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
            throw new Error(
                `Runtime commit '${hash}' not found in pack catalogs.\n`
                + 'Run enumerate stages to refresh:\n'
                + '  bench --stages enumerate-daily-packs,enumerate-release-packs',
            );
        }
        // First match = latest (lists are sorted newest-first)
        runtimeTarget = matches[0];
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

// ── Stage Entry Point ────────────────────────────────────────────────────────

export async function run(ctx: BenchContext): Promise<BenchContext> {
    banner('Resolve SDK');

    // ── Step 1: Load pack catalogs ───────────────────────────────────────
    const packs = await loadPacks(ctx.artifactsDir);
    info(`Loaded ${packs.length} pack entries`);

    // ── Step 2: Resolve target ───────────────────────────────────────────
    const { runtimeEntry, sdkEntry } = resolveTarget(ctx, packs);

    const sdkVersion = sdkEntry.entry.sdkVersion;
    const runtimePackVersion = runtimeEntry.entry.runtimePackVersion;

    info(`SDK: ${sdkVersion} (${sdkEntry.source})`);
    info(`Runtime pack: ${runtimePackVersion}`);
    info(`Runtime commit: ${runtimeEntry.entry.runtimeGitHash.slice(0, 10)}`);

    // ── Step 3: Build SdkInfo ────────────────────────────────────────────
    const sdkInfo: SdkInfo = populateVersionFields({
        sdkVersion,
        runtimeGitHash: runtimeEntry.entry.runtimeGitHash,
        aspnetCoreGitHash: sdkEntry.entry.aspnetCoreGitHash,
        sdkGitHash: sdkEntry.entry.sdkGitHash,
        vmrGitHash: sdkEntry.entry.vmrGitHash,
        runtimeCommitDateTime: runtimeEntry.entry.runtimeCommitDateTime,
        runtimeCommitAuthor: runtimeEntry.entry.runtimeCommitAuthor,
        runtimeCommitMessage: runtimeEntry.entry.runtimeCommitMessage,
        aspnetCoreCommitDateTime: sdkEntry.entry.aspnetCoreCommitDateTime,
        aspnetCoreVersion: sdkEntry.entry.aspnetCoreVersion,
        runtimePackVersion,
        workloadVersion: sdkEntry.entry.workloadVersion,
        bootstrapSdkVersion: sdkEntry.entry.bootstrapSdkVersion,
        releaseDate: sdkEntry.entry.releaseDate,
    });

    info(`Resolved SDK info: ${sdkVersion}`);

    // ── Step 4: Detect if this is the latest daily build ─────────────────
    const latestDaily = packs.find(p =>
        p.source === 'daily'
        && getVersionMajor(p.entry.sdkVersion) === sdkInfo.major,
    );
    const isLatestDaily = sdkEntry.source === 'daily'
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

    // ── Step 6: Update context ───────────────────────────────────────────
    return {
        ...ctx,
        sdkDir,
        dotnetBin,
        sdkInfo,
        isLatestDaily,
        buildLabel: sdkVersion,
        publishDir: join(ctx.artifactsDir, 'publish'),
        resultsDir: join(ctx.artifactsDir, 'results'),
    };
}
