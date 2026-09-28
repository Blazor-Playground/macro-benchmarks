import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type BenchContext, type BuildFailureSummary } from '../context.js';
import { collectBuildShardReports } from '../lib/build-reports.js';
import { commitAndPushWithRetry } from '../lib/git-push.js';
import { err, info } from '../log.js';

function getCiRunUrl(ctx: BenchContext): string | undefined {
    return ctx.ciRunId
        ? `https://github.com/${ctx.repo}/actions/runs/${ctx.ciRunId}`
        : undefined;
}

async function pushFailedMarker(ctx: BenchContext, failures: BuildFailureSummary[]): Promise<boolean> {
    if (!ctx.sdkInfo?.sdkVersion || ctx.dryRun) {
        if (ctx.dryRun) info(`[dry-run] Skipping .failed marker for ${ctx.sdkInfo?.sdkVersion}`);
        return true;
    }

    const sdkVersion = ctx.sdkInfo.sdkVersion;
    const trackingDir = join(ctx.repoRoot, 'tracking');
    const locksDir = join(trackingDir, 'locks');
    const lockFile = join(locksDir, `${sdkVersion}.lock`);
    const failedFile = join(locksDir, `${sdkVersion}.failed`);
    await mkdir(locksDir, { recursive: true });

    const content = {
        failedAt: new Date().toISOString(),
        ciRunId: ctx.ciRunId,
        ciRunUrl: getCiRunUrl(ctx),
        failures,
    };

    try {
        return await commitAndPushWithRetry({
            dir: trackingDir,
            addPaths: ['locks/'],
            commitMessage: `Failed ${sdkVersion}`,
            label: `Failed marker for ${sdkVersion}`,
            dryRun: false,
            applyChanges: async () => {
                await writeFile(failedFile, JSON.stringify(content, null, 2) + '\n', 'utf-8');
                if (existsSync(lockFile)) await unlink(lockFile);
            },
        });
    } catch (error) {
        err(`Failed to persist build failure marker: ${error instanceof Error ? error.message : error}`);
        return false;
    }
}

export async function run(ctx: BenchContext): Promise<BenchContext> {
    if (!ctx.sdkInfo?.sdkVersion) {
        throw new Error('collect-builds stage requires ctx.sdkInfo');
    }

    const runId = process.env['BENCH_RUN_ID'] || ctx.runId;
    if (!runId) {
        throw new Error('collect-builds stage requires BENCH_RUN_ID or ctx.runId');
    }

    const reportsDir = join(ctx.artifactsDir, 'build-reports');
    const { succeeded, failures, reportErrors } = await collectBuildShardReports(
        reportsDir,
        ctx.apps,
        ctx.sdkInfo.sdkVersion,
    );

    if (reportErrors.length > 0) {
        throw new Error(`Build report collection failed:\n${reportErrors.join('\n')}`);
    }

    const resultsDir = join(ctx.artifactsDir, 'results', runId);
    await mkdir(resultsDir, { recursive: true });
    await writeFile(
        join(resultsDir, 'build-manifest.json'),
        JSON.stringify(succeeded, null, 2) + '\n',
        'utf-8',
    );
    await writeFile(
        join(resultsDir, 'sdk-info.json'),
        JSON.stringify(ctx.sdkInfo, null, 2) + '\n',
        'utf-8',
    );
    await writeFile(join(ctx.artifactsDir, 'results', '.run-id'), runId, 'utf-8');

    const result = { ...ctx, buildManifest: succeeded, runId, resultsDir };
    if (failures.length > 0) {
        const markerPersisted = await pushFailedMarker(result, failures);
        if (!markerPersisted) {
            err('The original build failure is preserved, but its tracking marker was not persisted.');
        }
        throw new Error(`Build failed for: ${failures.map(f => f.target).join(', ')}`);
    }

    info(`Merged ${succeeded.length} build manifest cells from ${ctx.apps.length} shards`);
    return result;
}
