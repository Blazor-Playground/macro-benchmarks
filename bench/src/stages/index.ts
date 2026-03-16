import { type BenchContext } from '../context.js';
import { Stage } from '../enums.js';
import { banner } from '../log.js';

// ── Stage Function Type ──────────────────────────────────────────────────────

export type StageFn = (ctx: BenchContext) => Promise<BenchContext>;

// ── Registry ─────────────────────────────────────────────────────────────────

const stageHandlers = new Map<Stage, StageFn>();

export function registerStage(stage: Stage, handler: StageFn): void {
    stageHandlers.set(stage, handler);
}

// ── Register All Stages ──────────────────────────────────────────────────────

import { run as checkOutTracking } from './check-out-tracking.js';
import { run as dockerImage } from './docker-image.js';
import { run as resolveSdk } from './resolve-sdk.js';
import { run as downloadSdk } from './download-sdk.js';
import { run as build } from './build.js';
import { run as measure } from './measure.js';
import { run as schedule } from './schedule.js';
import { run as enumerateCommits } from './enumerate-commits.js';
import { run as enumerateDailyPacks } from './enumerate-daily-packs.js';
import { run as enumerateReleasePacks } from './enumerate-release-packs.js';
import { run as transformViews } from './transform-views.js';
import { run as updateCache } from './update-cache.js';
import { run as updateViews } from './update-views.js';
import { run as deployLatestApp } from './deploy-latest-app.js';

registerStage(Stage.CheckOutTracking, checkOutTracking);
registerStage(Stage.EnumerateCommits, enumerateCommits);
registerStage(Stage.EnumerateDailyPacks, enumerateDailyPacks);
registerStage(Stage.EnumerateReleasePacks, enumerateReleasePacks);
registerStage(Stage.DockerImage, dockerImage);
registerStage(Stage.ResolveSdk, resolveSdk);
registerStage(Stage.DownloadSdk, downloadSdk);
registerStage(Stage.Build, build);
registerStage(Stage.Measure, measure);
registerStage(Stage.Schedule, schedule);
registerStage(Stage.TransformViews, transformViews);
registerStage(Stage.UpdateCache, updateCache);
registerStage(Stage.UpdateViews, updateViews);
registerStage(Stage.DeployLatestApp, deployLatestApp);

// ── Direct Runner (no docker wrapping) ───────────────────────────────────────

async function runStagesDirect(ctx: BenchContext): Promise<BenchContext> {
    let current = ctx;
    for (const stage of current.stages) {
        const handler = stageHandlers.get(stage);
        if (!handler) {
            throw new Error(`Stage '${stage}' has no registered handler.`);
        }
        if (current.verbose) {
            banner(`Stage: ${stage}`);
        }
        current = await handler(current);
    }
    return current;
}

// ── Public Runner ────────────────────────────────────────────────────────────

export async function runStages(ctx: BenchContext): Promise<BenchContext> {
    return runStagesDirect(ctx);
}
