import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { exec, execCapture } from '../exec.js';
import { info, debug } from '../log.js';

export interface BranchCheckoutOptions {
    verbose?: boolean;
    /**
     * When set, use a sparse checkout that only materialises the listed paths.
     * Uses `--filter=blob:none --sparse` on clone and `git sparse-checkout set`
     * so only the requested trees are fetched.
     */
    sparsePaths?: string[];
}

/**
 * Ensure a given branch is available locally under <repoRoot>/<localDir>/.
 *   • If the folder already contains a .git directory: git pull
 *   • Otherwise: git clone --branch <branch> --single-branch --depth 1
 *
 * When `sparsePaths` is provided the clone uses `--filter=blob:none --sparse`
 * and only the listed directories/files are checked out.
 *
 * Returns the path to the checkout directory.
 */
export async function ensureBranchCheckout(repoRoot: string, branch: string, localDir: string, opts?: boolean | BranchCheckoutOptions): Promise<string> {
    // Support legacy boolean-only `verbose` argument
    const { verbose, sparsePaths } = typeof opts === 'boolean' ? { verbose: opts, sparsePaths: undefined } : (opts ?? {});

    const dir = join(repoRoot, localDir);

    if (existsSync(join(dir, '.git'))) {
        info(`${localDir}/ exists — pulling latest`);

        // sparse checkout ignored for existing checkouts

        await exec('git', ['-C', dir, 'pull'], { throwOnError: false });
    } else {
        info(`${localDir}/ not found — cloning ${branch} branch`);
        await exec('git', ['config', '--global', '--add', 'safe.directory', repoRoot], { throwOnError: false });
        const remoteUrl = await execCapture('git', ['remote', 'get-url', 'origin'], {
            cwd: repoRoot,
        });

        const cloneArgs = [
            'clone', '--branch', branch, '--single-branch', '--depth', '1',
        ];
        if (sparsePaths?.length) {
            cloneArgs.push('--filter=blob:none', '--sparse');
        }
        cloneArgs.push(remoteUrl, dir);
        await exec('git', cloneArgs);

        // Configure sparse-checkout paths after clone
        if (sparsePaths?.length) {
            await exec('git', ['-C', dir, 'sparse-checkout', 'set', ...sparsePaths]);
        }

        // Propagate any extraheader auth from the main checkout so push works in CI
        const extraHeader = await execCapture('git', [
            '-C', repoRoot, 'config', '--get', 'http.https://github.com/.extraheader',
        ], { throwOnError: false });
        if (extraHeader) {
            await exec('git', [
                '-C', dir, 'config',
                'http.https://github.com/.extraheader', extraHeader,
            ]);
        }
    }

    if (verbose) debug(`${branch} checkout ready at ${dir}`);
    return dir;
}
