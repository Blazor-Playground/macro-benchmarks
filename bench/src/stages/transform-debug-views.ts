import { resolve } from 'node:path';
import type { BenchContext } from '../context.js';
import { readDebugResults, writeDebugViews } from '../lib/debug-views.js';
import { info } from '../log.js';

export async function run(ctx: BenchContext): Promise<BenchContext> {
    const input = ctx.artifactsInputDir || ctx.resultsDir || resolve(ctx.artifactsDir, 'debug-results');
    const output = ctx.debugViewsDir || resolve(ctx.artifactsDir, 'debug-views');
    const batches = await readDebugResults(input);
    if (!batches.length) throw new Error(`No clean-Debug result files in ${input}`);
    await writeDebugViews(batches, output);
    info(`Wrote ${batches.length} clean-Debug batches to ${output}; no tracking or publication performed`);
    return ctx;
}
