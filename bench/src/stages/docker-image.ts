import { join } from 'node:path';
import { type BenchContext } from '../context.js';
import { dockerBuild, dockerImageExists } from '../exec.js';
import { banner, info } from '../log.js';

// ── Image Constants ──────────────────────────────────────────────────────────

export const BUILD_IMAGE = 'browser-bench-build:latest';
export const MEASURE_IMAGE = 'browser-bench-measure:latest';

// ── Stage ────────────────────────────────────────────────────────────────────

export async function run(ctx: BenchContext): Promise<BenchContext> {
    if (ctx.skipDockerBuild) {
        info('[docker-image] skipped (--skip-docker-build)');
        return ctx;
    }
    if (ctx.isDocker) {
        info('[docker-image] skipped (already inside a container)');
        return ctx;
    }

    const dockerfile = join(ctx.repoRoot, 'docker', 'Dockerfile');
    const buildContext = ctx.repoRoot;

    const buildExists = !ctx.forceDockerBuild && await dockerImageExists(BUILD_IMAGE);
    const measureExists = !ctx.forceDockerBuild && await dockerImageExists(MEASURE_IMAGE);

    if (buildExists && measureExists) {
        info('Docker images already exist — skipping build (use --force-docker-build or delete images to force)');
        return ctx;
    }

    banner('Docker image build');

    if (!buildExists) {
        info(`Building ${BUILD_IMAGE}...`);
        await dockerBuild(BUILD_IMAGE, 'browser-bench-build', dockerfile, buildContext);
    } else {
        info(`${BUILD_IMAGE} already exists — skipping`);
    }

    if (!measureExists) {
        info(`Building ${MEASURE_IMAGE}...`);
        await dockerBuild(MEASURE_IMAGE, 'browser-bench-measure', dockerfile, buildContext);
    } else {
        info(`${MEASURE_IMAGE} already exists — skipping`);
    }

    info('Docker images ready');
    return ctx;
}
