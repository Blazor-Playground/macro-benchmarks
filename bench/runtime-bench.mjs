import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { compare, defaultComparisonOutput, measurementOptions, parseCompareOptions } from './compare-local-runtime.mjs';
import { checkPrerequisites, probeCommand, probeTar, reportPrerequisites } from './local-prerequisites.mjs';
import { currentComparisonPath, displaySavedResults, readCurrentComparison, variantName } from './local-results.mjs';
import {
    collectBeforeRange, collectRecentBefore, dropBeforeRange, historyRange, latestBeforeDay, missingBeforeDays,
    recentDayCount, selectRangeCommits, selectRecentCommits,
} from './local-history.mjs';
import { loadLocalComparisonData } from './local-comparison-data.mjs';
import { runCommand } from './local-command.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const statePath = join(root, 'artifacts', 'local-runtime', 'quick-start.json');
const help = `Runtime contributor quick start (run from macro-benchmarks; Node.js >= 24):

  node bench/bootstrap.mjs [runtime-path] [comparison options] [-- measurement options]
    Before: separate clean merge-base checkout. After: your checkout with its changes.
    Omit runtime-path to clone dotnet/runtime for the after checkout.
  node bench/iterate.mjs [comparison options] [-- measurement options]
    Rebuild and measure the remembered checkout/options; reuse valid before controls.
  node bench/bootstrap.mjs --measure-recent-days=7
    Add clean daily before controls using the saved setup; preserve the current after.
  node bench/runtime-bench.mjs results [--view history|matched]
    Print the current shared result without building or checking prerequisites.
  node bench/runtime-bench.mjs history add [--from YYYY-MM-DD [--to YYYY-MM-DD|today]] [--fetch]
    Add missing dates to the current experiment, newest first; keep passed dates and after.
    No dates: add days since the latest complete before, through today.
    One --from: that day only. --fetch explicitly refreshes runtime origin/main.
  node bench/runtime-bench.mjs history drop --from YYYY-MM-DD [--to YYYY-MM-DD]
  node bench/runtime-bench.mjs history drop --all
    Remove dates from active history only. Keep raw files, caches, after and matched control.
    Both history commands accept --dry-run and --output <control-cache-directory>.
    Dates are inclusive UTC. Dry runs never fetch, build, or change results.

origin/main is the local tracking ref; only an explicit history add --fetch refreshes it.
Defaults: Mono interpreter control + CoreCLR publish/R2R composite BEFORE and AFTER.
Use --variant r2r to switch both CoreCLR sides to non-composite R2R.
Release, Chrome/desktop+mobile, 10 cold + 5 warm loads,
1 Havit walkthrough. Installed Google Chrome is preferred; otherwise use Playwright
Chromium. Missing prerequisites are reported with install commands, never installed.
Results match NET12 focus: mobile startup, desktop walkthrough/download/publish.
When the current comparison has history, results defaults to the UI's
latest historical baseline versus fixed after. --view matched selects its same-base pair.
Options such as --variant r2r, --variant composite or --sdk are forwarded and remembered.
Recent days include today (UTC); pin local origin/main once, selecting its
first-parent snapshot at each UTC day end (today: invocation time). No automatic fetch.
Repeat to reuse valid controls and retry failed dates. Historical clones are owned,
separate from your changed checkout. Native builds may take substantial time/space.
Old interpreter-only settings require another bootstrap to select this experiment.`;

function splitArguments(args) {
    const separator = args.indexOf('--');
    return separator < 0 ? [args, []] : [args.slice(0, separator), args.slice(separator + 1)];
}

export function historyArguments(action, args) {
    const [options, measurement] = splitArguments(args);
    const forwarded = [];
    let days;
    for (let index = 0; index < options.length; index++) {
        const arg = options[index];
        if (arg !== '--measure-recent-days' && !arg.startsWith('--measure-recent-days=')) {
            forwarded.push(arg);
            continue;
        }
        if (action !== 'bootstrap') throw new Error('--measure-recent-days is a bootstrap option.');
        if (days !== undefined) throw new Error('Specify --measure-recent-days only once.');
        days = recentDayCount(arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : options[++index]);
    }
    return { days, args: [...forwarded, ...(args.includes('--') ? ['--', ...measurement] : [])] };
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
    stateFile = statePath, outputDir = defaultComparisonOutput, defaults = selectDefaults,
    check = checkPrerequisites, report = reportPrerequisites, run = compare, collect = collectRecentBefore,
    now = () => new Date(), selectHistory = selectRecentCommits,
} = {}, extraArgs = []) {
    const history = historyArguments(action, extraArgs);
    const startedAt = now();
    let historyPlan;
    extraArgs = history.args;
    let settings;
    let remembered = action === 'iterate';
    if (action === 'bootstrap' && history.days !== undefined && !runtimePath) {
        try {
            settings = JSON.parse(await readFile(stateFile, 'utf8'));
            remembered = true;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (action === 'bootstrap' && !remembered) {
        settings = {
            version: 3, runtimeRepo: resolve(runtimePath ?? join(outputDir, 'runtime-coreclr')),
            output: resolve(outputDir), ...await defaults(),
        };
    } else if (remembered) {
        try {
            settings ??= JSON.parse(await readFile(stateFile, 'utf8'));
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
        } else throw new Error('Choose bootstrap, iterate, results, or history. Use --help.');

    const initialArgs = remembered ? settings.compareArgs :
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
    if (history.days !== undefined && options['runtime-ref'] && remembered) {
        throw new Error('History uses the remembered checkout; --runtime-ref is only for a new bootstrap clone.');
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
        console.log(`${history.days !== undefined && remembered ? 'After: preserve the current saved measurement; fill daily before controls'
            : 'Before: separate clean checkout at the merge base with local origin/main'}\nAfter runtime: ${settings.runtimeRepo}\n` +
            `Browser: ${settings.systemChrome ? 'installed Google Chrome' : 'Playwright Chromium'}\n` +
            `Modes: CoreCLR ${variantName({ runtime: 'coreclr', variant: options['before-variant'] })} before; ` +
            `CoreCLR ${variantName({ runtime: 'coreclr', variant: options.variant })} after` +
            `${options['mono-before'] ? '; saved Mono before control' : options['include-mono-before'] ? '; Mono interpreter before' : ''}.\n` +
            `${options.configuration} / ${measurement.engine}/${measurement.profile}; ` +
            `${measurement['cold-runs']} cold, ${measurement['warm-runs']} warm, ${measurement['walkthrough-runs']} walkthrough.`);
        const hooks = {
            getBrowserIdentity: async () => prerequisites.browsers,
            onSourceSelected: async ({ runtimeRepo, commit }) => {
                if (settings.pendingRuntimeRef) {
                    if (resolve(runtimeRepo) !== settings.runtimeRepo || !/^[a-f0-9]{40,64}$/i.test(commit)) {
                        throw new Error('Runtime ref selection returned an unexpected checkout or commit; iteration remains blocked.');
                    }
                    settings.pendingRuntimeRef = undefined;
                    settings.selectedRuntimeCommit = commit;
                    await saveSettings(stateFile, settings);
                }
                if (history.days !== undefined) historyPlan = selectHistory(runtimeRepo, history.days, startedAt);
            },
        };
        let result;
        if (history.days === undefined || !remembered) {
            await saveSettings(stateFile, settings);
            console.log(`Remembered checkout/settings: ${stateFile}`);
            result = await run(options, hooks);
        }
        if (history.days !== undefined) {
            result = await collect({ ...options, 'runtime-repo': settings.runtimeRepo, 'runtime-ref': undefined },
                history.days, { now: () => startedAt, ...(historyPlan ? { select: () => historyPlan } : {}),
                    measurementDependencies: { getBrowserIdentity: hooks.getBrowserIdentity } });
            await saveSettings(stateFile, settings);
        }
        return result;
    } finally {
        if (previousTar === undefined) delete process.env.BENCH_TAR;
        else process.env.BENCH_TAR = previousTar;
    }
}

export function parseHistoryOptions(action, args) {
    if (!['add', 'drop'].includes(action)) throw new Error('Choose history add or history drop. Use --help.');
    const { values, tokens } = parseArgs({
        args, tokens: true, options: {
            from: { type: 'string' }, to: { type: 'string' }, output: { type: 'string' },
            fetch: { type: 'boolean', default: false }, all: { type: 'boolean', default: false },
            'dry-run': { type: 'boolean', default: false },
        },
    });
    const seen = new Set();
    for (const token of tokens) {
        if (token.kind !== 'option') continue;
        if (seen.has(token.name)) throw new Error(`Specify --${token.name} only once.`);
        seen.add(token.name);
    }
    if (values.output === '') throw new Error('--output requires a nonempty directory.');
    if (values.to && !values.from) throw new Error('--to requires --from.');
    if (values.all && values.from) throw new Error('Use a date range or --all, not both.');
    if (action === 'add' && values.all) throw new Error('--all is a history drop option; select an add range.');
    if (action === 'drop' && values.fetch) throw new Error('--fetch is a history add option.');
    if (action === 'drop' && !values.all && !values.from) throw new Error('History drop requires --from or explicit --all.');
    return values;
}

function currentHistoryOptions(current, data, output) {
    const setup = current.comparison.setup;
    const manifest = data.after.manifest;
    const runtimeRepo = manifest.sdkInfo.localRuntime?.source?.checkout ?? current.comparison.runtimeRepo;
    if (typeof runtimeRepo !== 'string' || !setup?.measurement) {
        throw new Error('The current comparison has no saved runtime checkout/measurement setup. Run bootstrap or iterate first.');
    }
    const args = ['--runtime-repo', runtimeRepo, '--output', output, '--runtime', manifest.runtime,
        '--variant', manifest.variant, '--configuration', setup.configuration];
    for (const [option, value] of [['sdk', setup.sdk], ['tfm', setup.tfm], ['aspnet-version', setup.aspnetVersion]]) {
        if (value) args.push(`--${option}`, value);
    }
    for (const source of setup.excludedSources ?? []) args.push('--exclude-source', source);
    args.push('--');
    for (const key of Object.keys(measurementOptions([])).filter(key => key !== 'verbose')) {
        const value = setup.measurement[key];
        if (value === undefined) throw new Error(`Current comparison is missing saved measurement --${key}; bootstrap or iterate first.`);
        if (typeof value === 'boolean') {
            if (value) args.push(`--${key}`);
        } else args.push(`--${key}`, String(value));
    }
    return parseCompareOptions(args);
}

export async function historyCommand(action, args, {
    getCurrent = readCurrentComparison, collect = collectBeforeRange, drop = dropBeforeRange,
    now = () => new Date(), outputDir = defaultComparisonOutput, defaults = selectDefaults,
    check = checkPrerequisites, report = reportPrerequisites,
    fetchMain = runtimeRepo => runCommand('git',
        ['fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main'], { cwd: runtimeRepo }),
    select = selectRangeCommits,
} = {}) {
    const values = parseHistoryOptions(action, args);
    const stamp = now();
    const current = await getCurrent();
    if (!current) throw new Error('No current comparison. Run bootstrap or iterate first.');
    const parent = dirname(current.path);
    const output = resolve(values.output ?? (basename(parent).startsWith('comparison-') ? dirname(parent) : outputDir));
    if (action === 'drop') {
        return drop({ output, from: values.from, to: values.to ?? values.from, all: values.all, dryRun: values['dry-run'] },
            { getCurrent, now: () => stamp });
    }
    const data = await loadLocalComparisonData(current.comparison);
    const today = stamp.toISOString().slice(0, 10);
    const latest = latestBeforeDay(current.comparison);
    const from = values.from ?? (latest && latest < today
        ? new Date(Date.parse(`${latest}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : today);
    const range = historyRange(from, values.to ?? (values.from ? from : today), stamp);
    const missing = missingBeforeDays(current.comparison, range.from, range.to, stamp);
    if (!missing.length) {
        console.log('All requested before-history dates are already measured; existing results are unchanged.');
        return { comparisonPath: current.path, skipped: range.days };
    }
    const options = currentHistoryOptions(current, data, output);
    if (values['dry-run']) {
        if (values.fetch) console.log('Dry run: --fetch is skipped; planning from the existing local origin/main.');
        const plan = select(options['runtime-repo'], range.from, range.to, stamp, current.comparison);
        console.log(`Would add before controls, newest first: ${plan.days.map(day => `${day.day} ${day.commit}`).join(', ')}.\n` +
            `Existing dates and after unchanged. Control output: ${output}`);
        return { comparisonPath: current.path, selection: plan, dryRun: true };
    }
    for (const key of ['WasmReadyToRunProfile', 'PublishReadyToRunCrossgen2ExtraArgs']) {
        if (process.env[key]) throw new Error(`Unset ${key} before adding clean before-history controls; inherited experiment overrides are not supported.`);
    }
    if (values.fetch) await fetchMain(options['runtime-repo']);
    const measurement = measurementOptions(options.measureArgs);
    const prerequisites = await check({
        runtimeRepo: options['runtime-repo'], sdk: options.sdk, engines: measurement.engine.split(','),
        systemChrome: measurement['system-chrome'], headless: !measurement['no-headless'],
    });
    report(prerequisites);
    if (!prerequisites.ok) throw new Error('Resolve the missing prerequisites and repeat history add. Nothing was installed.');
    const previousTar = process.env.BENCH_TAR;
    process.env.BENCH_TAR = (await defaults()).tar;
    try {
        return await collect(options, range.from, range.to, {
            now: () => stamp,
            getCurrent: async () => {
                const live = await getCurrent();
                if (live?.path !== current.path) throw new Error('Current comparison changed during history add; retry without changing its experiment.');
                return live;
            },
            measurementDependencies: { getBrowserIdentity: async () => prerequisites.browsers },
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
        else if (action === 'history') {
            const [operation, ...options] = rest;
            await historyCommand(operation, options);
        } else {
            const runtimePath = action === 'bootstrap' && rest[0] && !rest[0].startsWith('-') ? rest.shift() : undefined;
            if (action !== 'bootstrap' && rest[0] && !rest[0].startsWith('-')) {
                throw new Error('Only bootstrap accepts one optional runtime path. Use --help.');
            }
            if (action === 'results') {
                const { values } = parseArgs({ args: rest, options: { view: { type: 'string' } } });
                if (values.view !== undefined && !['history', 'matched'].includes(values.view)) throw new Error('Choose results view history or matched.');
                await displaySavedResults(await currentComparisonPath(), console.log, { view: values.view });
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
