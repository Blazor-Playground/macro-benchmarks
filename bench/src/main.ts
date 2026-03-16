import { buildContext } from './args.js';
import { saveContext } from './context.js';
import { runStages } from './stages/index.js';

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const ctx = await buildContext();

    if (ctx.verbose) {
        console.log('Stages:', ctx.stages.join(', '));
        console.log('Runtime:', ctx.runtime);
        console.log('Apps:', ctx.apps.join(', '));
        console.log('Presets:', ctx.presets.join(', '));
        console.log('Engines:', ctx.engines.join(', '));
        console.log('Profiles:', ctx.profiles.join(', '));
        console.log('Repo root:', ctx.repoRoot);
        console.log('Artifacts:', ctx.artifactsDir);
        if (ctx.dryRun) console.log('Mode: dry-run');
    }

    const result = await runStages(ctx);

    // Persist context for cross-container handoff if needed
    const contextPath = process.argv.find((_, i, a) => a[i - 1] === '--context');
    if (contextPath) {
        await saveContext(result, contextPath);
        if (ctx.verbose) {
            console.log(`Context saved to ${contextPath}`);
        }
    }
}

main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
