import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { type BenchContext } from '../context.js';
import { banner, info, debug, err } from '../log.js';
import { GITHUB_API, githubHeaders, resolveGitHubToken } from '../lib/http.js';
import { getVersionMajor } from '../lib/version-utils.js';
import { exec } from '../exec.js';
import { commitAndPushWithRetry } from '../lib/git-push.js';

// ── Constants ────────────────────────────────────────────────────────────────

const LOCK_DIR = 'locks';
const LOCK_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours
const MAX_PUSH_RETRIES = 3;

// ── Types ────────────────────────────────────────────────────────────────────

interface PackEntry {
    sdkVersion: string;
    runtimeGitHash: string;
    [key: string]: unknown;
}

// ── Stage Entry ──────────────────────────────────────────────────────────────

export async function run(ctx: BenchContext): Promise<BenchContext> {
    banner('Schedule');

    const trackingDir = join(ctx.repoRoot, 'tracking');

    // Pull latest tracking state
    await exec('git', ['-C', trackingDir, 'pull'], { throwOnError: false });

    // 0. Mark current SDK as done (if we just completed a benchmark run)
    if (ctx.sdkInfo?.sdkVersion) {
        const locksDir = join(trackingDir, LOCK_DIR);
        const doneFile = join(locksDir, `${ctx.sdkInfo.sdkVersion}.done`);
        if (!existsSync(doneFile)) {
            info(`Marking ${ctx.sdkInfo.sdkVersion} as done`);
            await pushDoneMarker(trackingDir, ctx.sdkInfo.sdkVersion, ctx);
        }
    }

    // 1. Build the set of already-done SDK versions from tracking/locks/*.done
    const doneSdkVersions = await buildDoneSet(trackingDir, ctx.verbose);
    info(`Found ${doneSdkVersions.size} done SDK versions`);

    // 2. Build the set of in-progress (locked) SDK versions
    const lockedSdkVersions = await buildLockedSet(trackingDir, ctx.verbose);
    info(`Found ${lockedSdkVersions.size} locked (in-progress) SDK versions`);

    // 3. Build the set of permanently failed SDK versions from tracking/locks/*.failed
    const failedSdkVersions = await buildFailedSet(trackingDir, ctx.verbose);
    info(`Found ${failedSdkVersions.size} permanently failed SDK versions`);

    // 4. Load pack lists from artifacts (populated by enumerate stages)
    const releasePacks = await loadPacks(join(ctx.artifactsDir, 'release-packs-list.json'));
    const dailyPacks = await loadPacks(join(ctx.artifactsDir, 'daily-packs-list.json'));

    // 5. Filter to untested, unlocked, and not-failed packs
    const untestedReleases = releasePacks.filter(p =>
        !doneSdkVersions.has(p.sdkVersion) && !lockedSdkVersions.has(p.sdkVersion) && !failedSdkVersions.has(p.sdkVersion));
    const untestedDaily = dailyPacks.filter(p =>
        !doneSdkVersions.has(p.sdkVersion) && !lockedSdkVersions.has(p.sdkVersion) && !failedSdkVersions.has(p.sdkVersion));

    if (ctx.verbose) {
        debug(`Release packs: ${releasePacks.length} total, ${untestedReleases.length} untested+unlocked`);
        debug(`Daily packs: ${dailyPacks.length} total, ${untestedDaily.length} untested+unlocked`);
    }

    // 6. Filter by channel major if --sdk-channel was specified
    const channelMajor = getVersionMajor(ctx.sdkChannel);
    const filterByMajor = (p: PackEntry) => {
        const major = getVersionMajor(p.sdkVersion);
        return major === channelMajor;
    };
    const filteredReleases = isNaN(channelMajor) ? untestedReleases : untestedReleases.filter(filterByMajor);
    const filteredDaily = isNaN(channelMajor) ? untestedDaily : untestedDaily.filter(filterByMajor);

    if (ctx.verbose && !isNaN(channelMajor)) {
        debug(`Filtered to major ${channelMajor}: ${filteredReleases.length} releases, ${filteredDaily.length} daily`);
    }

    // 7. Priority: releases oldest→newest, then daily builds latest→oldest
    //    (release-packs-list already has newest first; daily-packs-list has newest first)
    const candidates = [
        ...filteredReleases.reverse(),   // oldest → newest
        ...filteredDaily,                 // already latest → oldest
    ];

    if (candidates.length === 0) {
        info('All packs already done or locked — nothing to dispatch');
        return ctx;
    }

    const toDispatch = candidates.slice(0, ctx.maxDispatches);
    info(`Will dispatch ${toDispatch.length} of ${candidates.length} untested packs`);

    // 7. Dispatch via GitHub REST API
    const repo = ctx.repo || 'blazor-playground/macro-benchmarks';
    const token = await resolveGitHubToken();
    if (!token && !ctx.dryRun) {
        throw new Error('No GitHub token available — set GITHUB_TOKEN or GH_TOKEN');
    }

    for (const pack of toDispatch) {
        // Create lock file locally (even in dry-run, so repeated dry-runs see the lock)
        const created = await createLockFile(trackingDir, pack.sdkVersion, ctx);
        if (!created) {
            info(`Skipping ${pack.sdkVersion} — already locked by another scheduler`);
            continue;
        }

        if (ctx.dryRun) {
            info(`[dry-run] workflow_dispatch benchmark.yml ref=${ctx.branch} sdk_version=${pack.sdkVersion}`);
            continue;
        }

        // Push lock to tracking before dispatching (so concurrent schedulers see it)
        const pushed = await pushLockFile(trackingDir, pack.sdkVersion, ctx);
        if (!pushed) {
            info(`Skipping ${pack.sdkVersion} — another scheduler locked it concurrently`);
            continue;
        }

        info(`Dispatching benchmark for sdk_version=${pack.sdkVersion}`);
        const url = `${GITHUB_API}/repos/${repo}/actions/workflows/benchmark.yml/dispatches`;
        const payload = {
            ref: ctx.branch,
            inputs: {
                sdk_version: pack.sdkVersion,
            },
        } as any;
        if (ctx.sdkChannel) {
            payload.inputs.sdk_channel = ctx.sdkChannel;
        }

        const resp = await fetch(url, {
            method: 'POST',
            headers: githubHeaders(token),
            body: JSON.stringify(payload),
        });
        if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            throw new Error(`Failed to dispatch workflow (${resp.status}): ${body.slice(0, 200)}`);
        }
    }

    return ctx;
}

// ── Done Helpers ─────────────────────────────────────────────────────────────

interface DoneFile {
    completedAt: string;
    ciRunId?: string;
}

/**
 * Scan tracking/locks/ for .done files and return the set of completed SDK versions.
 */
async function buildDoneSet(trackingDir: string, verbose?: boolean): Promise<Set<string>> {
    const done = new Set<string>();
    const locksDir = join(trackingDir, LOCK_DIR);

    if (!existsSync(locksDir)) {
        if (verbose) debug('No locks/ directory — no done SDK versions');
        return done;
    }

    const entries = await readdir(locksDir);
    for (const entry of entries) {
        if (!entry.endsWith('.done')) continue;
        const sdkVersion = entry.replace(/\.done$/, '');
        done.add(sdkVersion);
    }

    return done;
}

/**
 * Scan tracking/locks/ for .failed files and return the set of permanently failed SDK versions.
 */
async function buildFailedSet(trackingDir: string, verbose?: boolean): Promise<Set<string>> {
    const failed = new Set<string>();
    const locksDir = join(trackingDir, LOCK_DIR);

    if (!existsSync(locksDir)) {
        return failed;
    }

    const entries = await readdir(locksDir);
    for (const entry of entries) {
        if (!entry.endsWith('.failed')) continue;
        const sdkVersion = entry.replace(/\.failed$/, '');
        failed.add(sdkVersion);
        if (verbose) debug(`Permanently failed: ${sdkVersion}`);
    }

    return failed;
}

/**
 * Mark an SDK version as done: write .done file, remove .lock file, push to tracking.
 */
async function pushDoneMarker(
    trackingDir: string,
    sdkVersion: string,
    ctx: BenchContext,
): Promise<boolean> {
    const locksDir = join(trackingDir, LOCK_DIR);
    await mkdir(locksDir, { recursive: true });

    const lockFile = join(locksDir, `${sdkVersion}.lock`);
    const doneFile = join(locksDir, `${sdkVersion}.done`);

    const doneContent: DoneFile = {
        completedAt: new Date().toISOString(),
        ciRunId: ctx.ciRunId,
    };

    return commitAndPushWithRetry({
        dir: trackingDir,
        addPaths: [`${LOCK_DIR}/`],
        commitMessage: `Done ${sdkVersion}`,
        label: `Done marker for ${sdkVersion}`,
        dryRun: ctx.dryRun,
        maxRetries: MAX_PUSH_RETRIES,
        applyChanges: async () => {
            await writeFile(doneFile, JSON.stringify(doneContent, null, 2), 'utf-8');
            if (existsSync(lockFile)) await unlink(lockFile);
        },
    });
}

// ── Lock Helpers ─────────────────────────────────────────────────────────────

interface LockFile {
    dispatchedAt: string;
    ciRunId?: string;
}

/**
 * Scan tracking/locks/ and return SDK versions with non-expired lock files.
 * Lock files older than LOCK_TTL_MS (48h) are treated as expired (stuck/failed runs).
 */
async function buildLockedSet(trackingDir: string, verbose?: boolean): Promise<Set<string>> {
    const locked = new Set<string>();
    const locksDir = join(trackingDir, LOCK_DIR);

    if (!existsSync(locksDir)) {
        if (verbose) debug('No locks/ directory — no active locks');
        return locked;
    }

    const now = Date.now();
    const entries = await readdir(locksDir);

    for (const entry of entries) {
        if (!entry.endsWith('.lock')) continue;

        const lockPath = join(locksDir, entry);
        try {
            const content: LockFile = JSON.parse(await readFile(lockPath, 'utf-8'));
            const dispatchedAt = new Date(content.dispatchedAt).getTime();

            if (now - dispatchedAt > LOCK_TTL_MS) {
                if (verbose) debug(`Lock expired: ${entry} (dispatched ${content.dispatchedAt})`);
                continue; // Expired — treat as unlocked
            }

            const sdkVersion = entry.replace(/\.lock$/, '');
            locked.add(sdkVersion);
            if (verbose) debug(`Lock active: ${sdkVersion} (dispatched ${content.dispatchedAt})`);
        } catch {
            if (verbose) debug(`Ignoring malformed lock file: ${entry}`);
        }
    }

    return locked;
}

/**
 * Create a lock file locally for the given SDK version.
 * Checks for existing non-expired locks (including from git after a pull).
 * Returns true if the lock was written locally, false if already locked.
 */
async function createLockFile(
    trackingDir: string,
    sdkVersion: string,
    ctx: BenchContext,
): Promise<boolean> {
    const locksDir = join(trackingDir, LOCK_DIR);
    await mkdir(locksDir, { recursive: true });

    const lockFile = join(locksDir, `${sdkVersion}.lock`);

    // Check if lock already exists locally (from a previous dry-run or pulled from remote)
    if (existsSync(lockFile)) {
        try {
            const existing: LockFile = JSON.parse(await readFile(lockFile, 'utf-8'));
            const age = Date.now() - new Date(existing.dispatchedAt).getTime();
            if (age <= LOCK_TTL_MS) {
                info(`Lock already exists for ${sdkVersion} (by run ${existing.ciRunId ?? 'unknown'})`);
                return false;
            }
            if (ctx.verbose) debug(`Overwriting expired lock for ${sdkVersion}`);
        } catch {
            // Malformed lock — overwrite it
        }
    }

    const lockContent: LockFile = {
        dispatchedAt: new Date().toISOString(),
        ciRunId: ctx.ciRunId,
    };
    await writeFile(lockFile, JSON.stringify(lockContent, null, 2), 'utf-8');
    info(`Lock file created for ${sdkVersion}`);
    return true;
}

/**
 * Commit and push an already-created lock file to tracking.
 * Uses pull-recheck-push with retries to handle concurrent schedulers.
 * Returns true if the lock was successfully pushed, false if another scheduler got it first.
 */
async function pushLockFile(
    trackingDir: string,
    sdkVersion: string,
    ctx: BenchContext,
): Promise<boolean> {
    const lockRelPath = join(LOCK_DIR, `${sdkVersion}.lock`);
    const lockAbsPath = join(trackingDir, lockRelPath);

    return commitAndPushWithRetry({
        dir: trackingDir,
        addPaths: [lockRelPath],
        commitMessage: `Lock ${sdkVersion}`,
        label: `Lock for ${sdkVersion}`,
        dryRun: ctx.dryRun, // pushLockFile is only called in non-dry-run path
        maxRetries: MAX_PUSH_RETRIES,
        applyChanges: async () => {
            // Re-check: another scheduler may have pushed this lock
            if (existsSync(lockAbsPath)) {
                try {
                    const existing: LockFile = JSON.parse(await readFile(lockAbsPath, 'utf-8'));
                    if (existing.ciRunId !== ctx.ciRunId) {
                        const age = Date.now() - new Date(existing.dispatchedAt).getTime();
                        if (age <= LOCK_TTL_MS) {
                            info(`Lock taken by another scheduler for ${sdkVersion} (run ${existing.ciRunId ?? 'unknown'})`);
                            return false;
                        }
                        if (ctx.verbose) debug(`Overwriting expired lock for ${sdkVersion}`);
                    }
                } catch {
                    // Malformed lock — overwrite it
                }
            }

            const lockContent: LockFile = {
                dispatchedAt: new Date().toISOString(),
                ciRunId: ctx.ciRunId,
            };
            await writeFile(lockAbsPath, JSON.stringify(lockContent, null, 2), 'utf-8');
        },
    });
}

// ── Data Helpers ─────────────────────────────────────────────────────────────

async function loadPacks(path: string): Promise<PackEntry[]> {
    if (!existsSync(path)) return [];
    const data = JSON.parse(await readFile(path, 'utf-8'));
    return (data.packs ?? []) as PackEntry[];
}
