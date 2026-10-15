import { join } from 'node:path';
import { execCapture } from '../exec.js';
import { commitAndPushWithRetry } from './git-push.js';
import { type DebugBatch, validateDebugBatch } from './debug-results.js';
import { writeDebugViews } from './debug-views.js';

export async function publishDebugViews(batches: readonly DebugBatch[], checkout: string): Promise<void> {
    if (!batches.length) throw new Error('No clean-Debug batches to publish');
    for (const batch of batches) validateDebugBatch(batch);
    // The retry helper discards only its own rejected commits. Never run it on user work.
    if (await execCapture('git', ['-C', checkout, 'status', '--porcelain'])) {
        throw new Error('Debug publication requires a clean, dedicated gh-pages checkout');
    }
    if (await execCapture('git', ['-C', checkout, 'branch', '--show-current']) !== 'gh-pages'
        || await execCapture('git', ['-C', checkout, 'rev-parse', '--abbrev-ref', '@{upstream}']) !== 'origin/gh-pages') {
        throw new Error('Debug publication requires the gh-pages branch tracking origin/gh-pages');
    }
    const pushed = await commitAndPushWithRetry({
        dir: checkout, addPaths: ['data/views/debug/'], dryRun: false,
        commitMessage: 'Update clean Debug results\n\nCo-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>',
        label: 'Clean Debug views',
        // Read the newly pulled index on every attempt; rebasing a stale generated index is not a merge.
        applyChanges: () => writeDebugViews(batches, join(checkout, 'data/views/debug')),
    });
    if (!pushed) throw new Error('Clean-Debug publication failed after bounded retries; raw batches are unchanged');
}
