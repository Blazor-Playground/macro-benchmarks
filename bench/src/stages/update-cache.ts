import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { type BenchContext } from '../context.js';
import { commitAndPush } from '../lib/git-push.js';
import { info } from '../log.js';

// ── Stage: update-cache ──────────────────────────────────────────────────────
//
// Copies updated pack/commit lists from artifacts/ back into the tracking
// branch's cache/ directory, then commits and pushes if anything changed.
//
// Requires check-out-tracking to have run first (tracking/ must exist).

const CACHE_FILES = ['daily-packs-list.json', 'release-packs-list.json', 'commits-list.json'];

export async function run(ctx: BenchContext): Promise<BenchContext> {
    const trackingDir = join(ctx.repoRoot, 'tracking');
    const cacheDir = join(trackingDir, 'cache');
    await mkdir(cacheDir, { recursive: true });

    // Copy updated lists into gh-pages cache
    for (const file of CACHE_FILES) {
        const src = join(ctx.artifactsDir, file);
        if (existsSync(src)) {
            info(`Updating cache: ${file}`);
            await copyFile(src, join(cacheDir, file));
        }
    }

    await commitAndPush({
        repoRoot: ctx.repoRoot,
        dryRun: ctx.dryRun,
        checkoutDir: 'tracking',
        addPaths: ['cache/'],
        commitMessage: `Update cache ${ctx.sdkInfo?.sdkVersion ?? ''}`,
        label: 'Cache',
    });

    return ctx;
}
