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
