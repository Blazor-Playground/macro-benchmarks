import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type BenchContext } from '../context.js';
import { commitAndPushWithRetry } from './git-push.js';
import { err } from '../log.js';

export async function updateBuildLock(ctx: BenchContext): Promise<void> {
    if (!ctx.sdkInfo?.sdkVersion) return;

    const sdkVersion = ctx.sdkInfo.sdkVersion;
    const trackingDir = join(ctx.repoRoot, 'tracking');
    const lockFile = join(trackingDir, 'locks', `${sdkVersion}.lock`);
    if (!existsSync(lockFile)) return;

    try {
        await commitAndPushWithRetry({
            dir: trackingDir,
            addPaths: [`locks/${sdkVersion}.lock`],
            commitMessage: `Update lock ${sdkVersion}`,
            label: `Update lock for ${sdkVersion}`,
            dryRun: ctx.dryRun,
            applyChanges: async () => {
                const current = JSON.parse(await readFile(lockFile, 'utf-8'));
                current.ciRunId = ctx.ciRunId;
                current.ciRunUrl = ctx.ciRunId
                    ? `https://github.com/${ctx.repo}/actions/runs/${ctx.ciRunId}`
                    : undefined;
                await writeFile(lockFile, JSON.stringify(current, null, 2) + '\n', 'utf-8');
            },
        });
    } catch (error) {
        err(`Failed to update lock file: ${error instanceof Error ? error.message : error}`);
    }
}
