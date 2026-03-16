import { type BenchContext } from '../context.js';
import { commitAndPush } from '../lib/git-push.js';
import { info } from '../log.js';

// ── Stage: update-views ──────────────────────────────────────────────────────
//
// Commits and pushes the view JSON files that transform-views wrote into
// gh-pages/data/views/.
//

export async function run(ctx: BenchContext): Promise<BenchContext> {
    if (ctx.dryRun) {
        info('Skipping update-views (dry-run)');
        return ctx;
    }

    await commitAndPush({
        repoRoot: ctx.repoRoot,
        dryRun: false,
        checkoutDir: 'gh-pages',
        addPaths: ['data/views/'],
        commitMessage: `Update views ${ctx.sdkInfo?.sdkVersion ?? ''}`,
        label: 'Views',
    });

    return ctx;
}
