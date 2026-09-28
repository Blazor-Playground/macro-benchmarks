import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { exec } from '../exec.js';
import { info, err } from '../log.js';

export interface GitPushOptions {
    repoRoot: string;
    dryRun: boolean;
    /** Subdirectory name of the git checkout (e.g. 'gh-pages' or 'tracking') */
    checkoutDir: string;
    /** Paths to `git add` (relative to the checkout directory) */
    addPaths: string[];
    /** Commit message */
    commitMessage: string;
    /** Label for log messages (e.g. "Cache", "Views") */
    label: string;
}

/**
 * Stage, commit, and optionally push changes inside a branch checkout.
 * Returns true if a commit was created.
 */
export async function commitAndPush(opts: GitPushOptions): Promise<boolean> {
    const dir = join(opts.repoRoot, opts.checkoutDir);

    if (!existsSync(join(dir, '.git'))) {
        err(`${opts.checkoutDir}/ not found — run the appropriate checkout stage first`);
        return false;
    }

    for (const p of opts.addPaths) {
        await exec('git', ['-C', dir, 'add', p]);
    }

    const { exitCode } = await exec('git', ['-C', dir, 'diff', '--cached', '--quiet'], {
        throwOnError: false,
    });

    if (exitCode === 0) {
        info(`${opts.label} unchanged — nothing to push`);
        return false;
    }

    await exec('git', ['-C', dir, 'config', 'user.name', 'github-actions[bot]']);
    await exec('git', ['-C', dir, 'config', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
    await exec('git', ['-C', dir, 'commit', '-m', opts.commitMessage]);

    if (opts.dryRun) {
        info(`${opts.label} committed locally (dry-run — skipping push)`);
    } else {
        await exec('git', ['-C', dir, 'push']);
        info(`${opts.label} updated and pushed`);
    }
    return true;
}

// ── Commit + push with pull-rebase-retry ─────────────────────────────────────

export interface CommitAndPushWithRetryOptions {
    /** Directory containing the .git checkout */
    dir: string;
    /** Paths to `git add` (relative to dir) */
    addPaths: string[];
    /** Commit message */
    commitMessage: string;
    /** Label for log messages */
    label: string;
    /** Skip push in dry-run */
    dryRun: boolean;
    /** Max push attempts (default 3) */
    maxRetries?: number;
    /**
     * Called to (re-)apply local file changes before each push attempt.
     * Also called once before the retry loop for local-only / dry-run use.
     * Return false to abort (e.g. if a concurrent process owns the lock).
     */
    applyChanges: () => Promise<boolean | void>;
}

/**
 * Apply local changes, commit, and push with pull-rebase-retry on conflict.
 * Returns true if committed (or already up-to-date), false if aborted by applyChanges.
 */
export async function commitAndPushWithRetry(opts: CommitAndPushWithRetryOptions): Promise<boolean> {
    const { dir, addPaths, commitMessage, label, dryRun, maxRetries = 3, applyChanges } = opts;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const { exitCode: pullCode } = await exec('git', ['-C', dir, 'pull', '--rebase'], {
            throwOnError: false,
        });
        if (pullCode !== 0) {
            if (attempt < maxRetries) {
                info(`Pull failed (attempt ${attempt}/${maxRetries}) — retrying`);
                await new Promise(resolve => setTimeout(resolve, 250 + Math.floor(Math.random() * 500)));
                continue;
            }
            err(`Failed to pull before updating ${label} after ${maxRetries} attempts`);
            return false;
        }

        const ok = await applyChanges();
        if (ok === false) return false;

        await exec('git', ['-C', dir, 'config', 'user.name', 'github-actions[bot]']);
        await exec('git', ['-C', dir, 'config', 'user.email', 'github-actions[bot]@users.noreply.github.com']);

        for (const p of addPaths) {
            await exec('git', ['-C', dir, 'add', p]);
        }

        const { exitCode: diffCode } = await exec('git', ['-C', dir, 'diff', '--cached', '--quiet'], {
            throwOnError: false,
        });
        if (diffCode === 0) {
            info(`${label} already in git`);
            return true;
        }

        if (dryRun) {
            info(`[dry-run] ${label}`);
            return true;
        }
        await exec('git', ['-C', dir, 'commit', '-m', commitMessage]);

        const { exitCode: pushCode } = await exec('git', ['-C', dir, 'push'], {
            throwOnError: false,
        });
        if (pushCode === 0) {
            info(`${label} pushed`);
            return true;
        }

        await exec('git', ['-C', dir, 'reset', '--hard', 'HEAD~1']);
        if (attempt < maxRetries) {
            info(`Push failed (attempt ${attempt}/${maxRetries}) — pulling and retrying`);
            await new Promise(resolve => setTimeout(resolve, 250 + Math.floor(Math.random() * 500)));
        }
    }

    err(`Failed to push ${label} after ${maxRetries} attempts`);
    return false;
}
