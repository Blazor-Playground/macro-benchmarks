import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, writeFile, rm, mkdir, cp, readdir, unlink } from 'node:fs/promises';
import { type BenchContext } from '../context.js';
import { App, deploymentRuntimeFor, shouldSkipDeployment } from '../enums.js';
import { ensureBranchCheckout } from '../lib/branch-checkout.js';
import { commitAndPush } from '../lib/git-push.js';
import { banner, info } from '../log.js';

// ── Stage: deploy-latest-app ─────────────────────────────────────────────────
//
// Deploys the CoreCLR viewer to the GitHub Pages root and sample apps to
// gh-pages/apps/<appname>/. Sample apps switch to CoreCLR on .NET 12 except Uno.
//
// Only runs when the current SDK is the latest daily build.

export async function run(ctx: BenchContext): Promise<BenchContext> {
    banner('Deploy Latest App');

    if (!ctx.isLatestDaily && ctx.isCI) {
        info('Skipping deploy-latest-app — not the latest daily build');
        return ctx;
    }

    // ── Ensure gh-pages is checked out ───────────────────────────────────
    await ensureBranchCheckout(ctx.repoRoot, 'gh-pages', 'gh-pages', ctx.verbose);

    const ghPagesDir = join(ctx.repoRoot, 'gh-pages');
    const appsDir = join(ghPagesDir, 'apps');
    const deployedApps: string[] = [];

    for (const app of ctx.apps) {
        const runtime = deploymentRuntimeFor(app, ctx.sdkInfo.major);
        const validPreset = ctx.presets.find(preset => shouldSkipDeployment(runtime, app, preset, ctx) === null);
        if (!validPreset) {
            info(`Skipping ${app} — no valid preset found for ${runtime} deployment`);
            continue;
        }

        const publishDir = join(ctx.artifactsDir, 'publish', app, runtime, ctx.buildLabel, validPreset);
        const wwwrootSrc = join(publishDir, 'wwwroot');

        if (!existsSync(wwwrootSrc)) {
            info(`Skipping ${app} — no published wwwroot at ${wwwrootSrc}`);
            continue;
        }

        if (app === App.BenchViewer) {
            const appDestDir = ghPagesDir;

            // ── Clean destination ────────────────────────────────────────────
            await rm(join(appDestDir, '_framework'), { recursive: true, force: true });
            await rm(join(appDestDir, 'css'), { recursive: true, force: true });
            for (const f of await readdir(appDestDir)) {
                if (f.endsWith('.mjs')) await unlink(join(appDestDir, f));
                if (f.endsWith('.html')) await unlink(join(appDestDir, f));
            }

            // ── Copy wwwroot contents ────────────────────────────────────────
            await cp(wwwrootSrc, appDestDir, { recursive: true });

        } else {
            const appDestDir = join(appsDir, app);

            // ── Clean destination ────────────────────────────────────────────
            if (existsSync(appDestDir)) {
                await rm(appDestDir, { recursive: true, force: true });
            }
            await mkdir(appDestDir, { recursive: true });

            // ── Copy wwwroot contents ────────────────────────────────────────
            await cp(wwwrootSrc, appDestDir, { recursive: true });

            // ── Rewrite base href in index.html ──────────────────────────────
            const indexPath = join(appDestDir, 'index.html');
            if (existsSync(indexPath)) {
                let html = await readFile(indexPath, 'utf-8');
                html = html.replace(
                    '<base href="/" />',
                    `<base href="/macro-benchmarks/apps/${app}/" />`,
                );
                await writeFile(indexPath, html, 'utf-8');
            }
        }

        deployedApps.push(app);
        info(`Deployed ${app} (${runtime}) → ${app === App.BenchViewer ? '/' : `apps/${app}/`}`);
    }

    if (deployedApps.length === 0) {
        info('No apps deployed');
        return ctx;
    }

    // ── Commit and push ──────────────────────────────────────────────────
    if (ctx.dryRun) {
        info('Skipping commit/push (dry-run)');
    } else {
        await commitAndPush({
            repoRoot: ctx.repoRoot,
            dryRun: false,
            checkoutDir: 'gh-pages',
            addPaths: ['./'],
            commitMessage: `Deploy apps (${ctx.buildLabel})`,
            label: 'Deploy apps',
        });
    }

    return ctx;
}
