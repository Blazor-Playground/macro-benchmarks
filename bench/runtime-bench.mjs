import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { compare, measurementOptions, parseCompareOptions } from './compare-local-runtime.mjs';
import { checkPrerequisites, probeCommand, probeTar, reportPrerequisites } from './local-prerequisites.mjs';
import { displaySavedResults, findLatestComparison, variantName } from './local-results.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const statePath = join(root, 'artifacts', 'local-runtime', 'quick-start.json');
const output = join(root, 'artifacts', 'local-runtime-comparisons');
const help = `Runtime contributor quick start (run from macro-benchmarks; Node.js >= 24):

  node bench/bootstrap.mjs [runtime-path] [comparison options] [-- measurement options]
    Before: separate clean merge-base checkout. After: your checkout with its changes.
    Omit runtime-path to clone dotnet/runtime for the after checkout.
  node bench/iterate.mjs [comparison options] [-- measurement options]
    Rebuild and measure the remembered checkout/options; reuse valid before controls.
  node bench/runtime-bench.mjs results
    Print the latest saved numbers without building or checking prerequisites.

origin/main is the local tracking ref; fetch it yourself if needed. No automatic fetch.
Defaults: Mono interpreter control + CoreCLR publish/R2R composite BEFORE and AFTER.
Use --variant r2r to switch both CoreCLR sides to non-composite R2R.
Release, Chrome/desktop+mobile, 10 cold + 5 warm loads,
1 Havit walkthrough. Installed Google Chrome is preferred; otherwise use Playwright
Chromium. Missing prerequisites are reported with install commands, never installed.
Results match NET12 focus: mobile startup, desktop walkthrough/download/publish.
Options such as --variant r2r, --variant composite or --sdk are forwarded and remembered.
Old interpreter-only settings require another bootstrap to select this experiment.`;

function splitArguments(args) {
    const separator = args.indexOf('--');
    return separator < 0 ? [args, []] : [args.slice(0, separator), args.slice(separator + 1)];
}

function rememberedArguments(options) {
    const args = [];
    for (const [name, value] of Object.entries(options)) {
        if (['measureArgs', 'help', 'runtime-ref', 'force-before', 'check-prerequisites'].includes(name) ||
            (name === 'before-variant' && value === options.variant) || value === undefined) continue;
        if (typeof value === 'boolean') {
            if (value) args.push(`--${name}`);
        } else {
            for (const item of Array.isArray(value) ? value : [value]) args.push(`--${name}`, item);
        }
    }
    return [...args, '--', ...options.measureArgs];
}

async function saveSettings(stateFile, settings) {
    await mkdir(dirname(stateFile), { recursive: true });
    const temporary = `${stateFile}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, JSON.stringify(settings, null, 2));
        await rename(temporary, stateFile);
    } finally {
        await rm(temporary, { force: true });
    }
}

export async function selectDefaults({
    platform = process.platform, env = process.env, home = homedir(), exists = existsSync,
    probe = probeCommand, checkTar = probeTar,
} = {}) {
    const candidates = platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')]
        : platform === 'win32' ? [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA]
            .filter(Boolean).map(path => join(path, 'Google', 'Chrome', 'Application', 'chrome.exe')) : [];
    const systemChrome = platform === 'linux'
        ? probe('google-chrome', ['--version'], platform).ok : candidates.some(path => exists(path));
    let tar = env.BENCH_TAR ?? 'tar';
    if (!env.BENCH_TAR && !(await checkTar('tar')).ok && (await checkTar('bsdtar')).ok) tar = 'bsdtar';
    return { systemChrome, tar };
}

export async function quickStart(action, runtimePath, {
    stateFile = statePath, outputDir = output, defaults = selectDefaults,
    check = checkPrerequisites, report = reportPrerequisites, run = compare,
} = {}, extraArgs = []) {
    let settings;
    if (action === 'bootstrap') {
        settings = {
            version: 3, runtimeRepo: resolve(runtimePath ?? join(outputDir, 'runtime-coreclr')),
            output: resolve(outputDir), ...await defaults(),
        };
    } else if (action === 'iterate') {
        try {
            settings = JSON.parse(await readFile(stateFile, 'utf8'));
        } catch (error) {
            if (error.code === 'ENOENT') throw new Error('Run node bench/bootstrap.mjs [runtime-path] once before iterating.');
            throw error;
        }
        if (settings.version === 1) {
            throw new Error('Old interpreter-only settings: run node bench/bootstrap.mjs [runtime-path] again to select the composite experiment.');
        }
        if (![2, 3].includes(settings.version) || typeof settings.runtimeRepo !== 'string' ||
            typeof settings.output !== 'string' || typeof settings.systemChrome !== 'boolean' ||
            typeof settings.tar !== 'string' || !Array.isArray(settings.compareArgs) ||
            settings.compareArgs.some(arg => typeof arg !== 'string')) throw new Error(`Invalid quick-start settings: ${stateFile}`);
        if (settings.pendingRuntimeRef) {
            throw new Error(`Requested runtime ref "${settings.pendingRuntimeRef}" was not confirmed; refusing to measure a different checkout revision. ` +
                `Select the intended revision yourself in "${settings.runtimeRepo}", then run node bench/bootstrap.mjs "${settings.runtimeRepo}". ` +
                'Alternatively retry bootstrap with a new --output directory. No checkout will be switched automatically.');
        }
        if (settings.version === 2) {
            const previous = parseCompareOptions(settings.compareArgs);
            settings.compareArgs = rememberedArguments({ ...previous, 'before-variant': undefined });
            settings.version = 3;
            console.log('Updating previous mixed-mode settings: before now matches the remembered after variant; source checkout is unchanged.');
        }
    } else throw new Error('Choose bootstrap, iterate, or results. Use --help for the two-command workflow.');

    const initialArgs = action === 'iterate' ? settings.compareArgs :
        ['--output', settings.output, '--runtime', 'coreclr', '--variant', 'composite',
            '--include-mono-before',
            ...(runtimePath ? ['--runtime-repo', settings.runtimeRepo] : []),
            '--', '--profile', 'desktop,mobile', ...(settings.systemChrome ? ['--system-chrome'] : [])];
    const [initialOptions, initialMeasurement] = splitArguments(initialArgs);
    const [extraOptions, extraMeasurement] = splitArguments(extraArgs);
    const options = parseCompareOptions([...initialOptions, ...extraOptions, '--', ...initialMeasurement, ...extraMeasurement]);
    if (options.runtime !== 'coreclr') throw new Error('Quick start compares CoreCLR after with NET12 controls; use compare-local-runtime.mjs for Mono experiments.');
    if (options['display-results'] !== undefined || options['check-prerequisites'] || options.help) {
        throw new Error('Use runtime-bench.mjs results or compare-local-runtime.mjs --check-prerequisites for read-only commands.');
    }
    options.output = resolve(options.output);
    for (const path of ['sdk', 'mono-before']) if (options[path]) options[path] = resolve(options[path]);
    settings.output = options.output;
    settings.runtimeRepo = resolve(options['runtime-repo'] ?? join(options.output, 'runtime-coreclr'));
    const measurement = measurementOptions(options.measureArgs);
    settings.systemChrome = measurement['system-chrome'];
    settings.compareArgs = rememberedArguments({ ...options, 'runtime-repo': settings.runtimeRepo });
    settings.pendingRuntimeRef = options['runtime-ref'];
    const previousTar = process.env.BENCH_TAR;
    process.env.BENCH_TAR = settings.tar;
    try {
        const prerequisites = await check({
            runtimeRepo: options['runtime-repo'], sdk: options.sdk, engines: measurement.engine.split(','),
            systemChrome: settings.systemChrome, headless: !measurement['no-headless'],
        });
        report(prerequisites);
        if (!prerequisites.ok) throw new Error('Resolve the missing prerequisites above and repeat this command. Nothing was installed.');
        console.log(`Before: separate clean checkout at the merge base with local origin/main\nAfter runtime: ${settings.runtimeRepo}\n` +
            `Browser: ${settings.systemChrome ? 'installed Google Chrome' : 'Playwright Chromium'}\n` +
            `Modes: CoreCLR ${variantName({ runtime: 'coreclr', variant: options['before-variant'] })} before; ` +
            `CoreCLR ${variantName({ runtime: 'coreclr', variant: options.variant })} after` +
            `${options['mono-before'] ? '; saved Mono before control' : options['include-mono-before'] ? '; Mono interpreter before' : ''}.\n` +
            `${options.configuration} / ${measurement.engine}/${measurement.profile}; ` +
            `${measurement['cold-runs']} cold, ${measurement['warm-runs']} warm, ${measurement['walkthrough-runs']} walkthrough.`);
        await saveSettings(stateFile, settings);
        console.log(`Remembered checkout/settings: ${stateFile}`);
        return await run(options, {
            getBrowserIdentity: async () => prerequisites.browsers,
            onSourceSelected: async ({ runtimeRepo, commit }) => {
                if (!settings.pendingRuntimeRef) return;
                if (resolve(runtimeRepo) !== settings.runtimeRepo || !/^[a-f0-9]{40,64}$/i.test(commit)) {
                    throw new Error('Runtime ref selection returned an unexpected checkout or commit; iteration remains blocked.');
                }
                settings.pendingRuntimeRef = undefined;
                settings.selectedRuntimeCommit = commit;
                await saveSettings(stateFile, settings);
            },
        });
    } finally {
        if (previousTar === undefined) delete process.env.BENCH_TAR;
        else process.env.BENCH_TAR = previousTar;
    }
}

export async function runQuickStartCli(args = process.argv.slice(2)) {
    try {
        const [action, ...rest] = args;
        if (!action || action === '--help' || rest.includes('--help')) console.log(help);
        else {
            const runtimePath = action === 'bootstrap' && rest[0] && !rest[0].startsWith('-') ? rest.shift() : undefined;
            if (action !== 'bootstrap' && rest[0] && !rest[0].startsWith('-')) {
                throw new Error('Only bootstrap accepts one optional runtime path. Use --help.');
            }
            if (action === 'results') {
                if (rest.length) throw new Error('Use compare-local-runtime.mjs --display-results for saved-result selection options.');
                await displaySavedResults(await findLatestComparison());
            } else await quickStart(action, runtimePath, undefined, rest);
        }
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    await runQuickStartCli();
}
