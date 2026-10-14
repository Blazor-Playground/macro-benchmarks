import { resolve } from 'node:path';
import type { BenchContext } from '../context.js';
import { readDebugResults } from '../lib/debug-views.js';
import { publishDebugViews } from '../lib/debug-publication.js';
import { info } from '../log.js';

export async function run(ctx: BenchContext): Promise<BenchContext> {
    if (ctx.dryRun) {
        info('Skipping clean-Debug publication (dry-run)');
        return ctx;
    }
    const input = ctx.artifactsInputDir || ctx.resultsDir || resolve(ctx.artifactsDir, 'debug-results');
    const batches = await readDebugResults(input);
    await publishDebugViews(batches, resolve(ctx.repoRoot, 'gh-pages'));
    return ctx;
}
