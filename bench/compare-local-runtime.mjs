import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, realpath, rename, rmdir, writeFile } from 'node:fs/promises';
import { cpus, hostname, release, totalmem } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { normalizeVariant, parseOptions as parsePublishOptions, publish } from './local-runtime.mjs';
import { runCommand, statusLine } from './local-command.mjs';
import { checkPrerequisites, probeBrowsers, reportPrerequisites } from './local-prerequisites.mjs';
import { writeLocalComparisonData } from './local-comparison-data.mjs';
import { displaySavedResults, findLatestComparison, formatResults, registerComparison } from './local-results.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const help = `Build and measure Havit before/after a runtime change (Node.js >= 24).

node bench/compare-local-runtime.mjs [options] [-- <measurement options>]

  --runtime-repo <path>         Use an existing runtime checkout, preserving all changes
                               Default: clone dotnet/runtime under the output directory
  --runtime-ref <ref>           Ref to check out in a newly cloned runtime repo only
  --runtime <coreclr|mono>      Default: coreclr (use separate checkouts per flavor)
  --variant <no-workload|r2r|aot|composite>  Default: composite for CoreCLR, interpreter for Mono
  --before-variant <variant>    Default: same as after (explicit override for mixed-mode experiments)
  --include-mono-before        Also build/cache a separate clean Mono interpreter control
  --configuration <Release|Debug>      Default: Release runtime, Release app
  --sdk <directory>            Optional compatible SDK used for BOTH app publishes
  --tfm <netN.0>               Optional TFM override for both app publishes
  --aspnet-version <version>   Optional ASP.NET package override for both publishes
  --exclude-source <name>     Explicit public NuGet source exclusion for both app publishes (repeatable)
  --mono-before <manifest>    Optional measured pristine Mono control at the same baseline commit
  --output <directory>        Default: artifacts/local-runtime-comparisons
  --force-before              Rebuild/remeasure even if a valid baseline is cached
  --check-prerequisites       Only report missing tools/dependencies and how to install them
  --display-results [file]    Print saved numbers; without a file, select the latest measured comparison
                             --output can restrict the latest-result search to a directory
  --help                      Show this help

Before = git merge-base HEAD origin/main, built in a separate clean checkout.
origin/main is the LOCAL tracking ref.
Successful before measurements are cached by revision + benchmark/browser/build setup.
After is always rebuilt and measured in the supplied checkout, including local changes.
No automatic fetch, reset, clean, commit, push, dependency or browser install.
Invoking this script explicitly starts potentially expensive runtime source builds.
Measurement options after -- are the same as the local-runtime helper, including --system-chrome.`;

export function parseCompareOptions(args) {
    const separator = args.indexOf('--');
    const { values, tokens } = parseArgs({
        tokens: true,
        args: (separator < 0 ? args : args.slice(0, separator)).map((arg, index, all) =>
            arg === '--display-results' && (!all[index + 1] || all[index + 1].startsWith('-'))
                ? '--display-results=' : arg),
        options: {
            'runtime-repo': { type: 'string' },
            'runtime-ref': { type: 'string' },
            runtime: { type: 'string', default: 'coreclr' },
            variant: { type: 'string' },
            'before-variant': { type: 'string' },
            'include-mono-before': { type: 'boolean', default: false },
            configuration: { type: 'string', default: 'Release' },
            sdk: { type: 'string' },
            tfm: { type: 'string' },
            'aspnet-version': { type: 'string' },
            'exclude-source': { type: 'string', multiple: true },
            'mono-before': { type: 'string' },
            output: { type: 'string', default: join(repoRoot, 'artifacts', 'local-runtime-comparisons') },
            'force-before': { type: 'boolean', default: false },
            'check-prerequisites': { type: 'boolean', default: false },
            'display-results': { type: 'string' },
            help: { type: 'boolean', default: false },
        },
    });
    if (values.help) return values;
    if (values['display-results'] !== undefined) {
        if (separator >= 0 ||
            tokens.some(token => token.kind === 'option' && !['display-results', 'output'].includes(token.name))) {
            throw new Error('--display-results [comparison.json] cannot be combined with build or measurement options.');
        }
        values.resultsOutput = tokens.some(token => token.kind === 'option' && token.name === 'output')
            ? resolve(values.output) : undefined;
        return values;
    }
    if (values['runtime-repo'] && values['runtime-ref']) {
        throw new Error('--runtime-ref is only allowed for a new clone; existing checkout changes are never switched.');
    }
    if ((values['mono-before'] || values['include-mono-before']) && values.runtime !== 'coreclr') {
        throw new Error('Mono before controls are only meaningful for CoreCLR comparisons.');
    }
    values.variant = normalizeVariant(values.variant ?? (values.runtime === 'coreclr' ? 'composite' : 'no-workload'), values.runtime);
    values['before-variant'] = normalizeVariant(values['before-variant'] ?? values.variant, values.runtime);
    values.measureArgs = separator < 0 ? [] : args.slice(separator + 1);
    parsePublishOptions(publishArgs(values, values['runtime-repo'] ?? 'runtime', 'check'));
    parsePublishOptions(publishArgs({ ...values, variant: values['before-variant'] },
        values['runtime-repo'] ?? 'runtime', 'check-before'));
    measurementOptions(values.measureArgs);
    return values;
}

function publishArgs(options, runtimeRepo, label) {
    const args = ['--runtime-repo', runtimeRepo, '--runtime', options.runtime,
        '--variant', options.variant, '--configuration', options.configuration, '--label', label, '--measure'];
    for (const key of ['sdk', 'tfm', 'aspnet-version']) {
        if (options[key]) args.push(`--${key}`, key === 'sdk' ? resolve(options[key]) : options[key]);
    }
    for (const source of options['exclude-source'] ?? []) args.push('--exclude-source', source);
    return [...args, '--', '--profile', measurementOptions(options.measureArgs).profile, ...options.measureArgs];
}

function git(cwd, args) {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
}

function sourceRemote(remote) {
    if (!/^(https?|ssh):\/\//i.test(remote)) return remote;
    const url = new URL(remote);
    url.password = '';
    if (url.protocol !== 'ssh:') url.username = '';
    return url.toString();
}

const digest = value => createHash('sha256').update(value).digest('hex');

async function readOptional(path) {
    try {
        return await readFile(path, 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
    }
}

export async function benchmarkDigest() {
    const names = git(repoRoot, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--',
        'bench', 'src', 'NuGet.config', 'package.json', 'package-lock.json']).split('\0').sort();
    const hash = createHash('sha256');
    for (const name of names) {
        if (!name) continue;
        if (name.startsWith('src/bench-viewer/')) continue;
        hash.update(name);
        try {
            hash.update(await readFile(join(repoRoot, name)));
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            hash.update('(deleted)');
        }
    }
    return hash.digest('hex');
}

export function measurementOptions(args) {
    const { values } = parseArgs({
        args,
        options: {
            engine: { type: 'string', default: 'chrome' },
            profile: { type: 'string', default: 'desktop,mobile' },
            'system-chrome': { type: 'boolean', default: false },
            'no-headless': { type: 'boolean', default: false },
            verbose: { type: 'boolean', default: false },
            'cold-runs': { type: 'string', default: '10' }, 'warm-runs': { type: 'string', default: '5' },
            'walkthrough-runs': { type: 'string', default: '1' }, timeout: { type: 'string', default: '60000' },
            retries: { type: 'string', default: '0' }, 'deadline-minutes': { type: 'string', default: '0' },
        },
    });
    const engines = values.engine.split(',').map(value => value.trim());
    const profiles = values.profile.split(',').map(value => value.trim());
    if (engines.some(engine => !['chrome', 'firefox'].includes(engine)) ||
        profiles.some(profile => !['desktop', 'mobile'].includes(profile)) ||
        (engines.includes('firefox') && !profiles.includes('desktop'))) {
        throw new Error('Use Chrome with desktop/mobile, or Firefox with desktop.');
    }
    for (const name of ['cold-runs', 'warm-runs', 'walkthrough-runs', 'timeout', 'retries', 'deadline-minutes']) {
        if (!/^\d+$/.test(values[name]) || !Number.isSafeInteger(Number(values[name]))) {
            throw new Error(`--${name} requires a nonnegative safe integer.`);
        }
        values[name] = Number(values[name]);
    }
    if (values['cold-runs'] === 0 || values['warm-runs'] === 0) throw new Error('Use at least one cold and warm run.');
    values.engine = [...new Set(engines)].sort().join(',');
    values.profile = [...new Set(profiles)].sort().join(',');
    return Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)));
}

async function browserIdentity(args) {
    const values = measurementOptions(args);
    const results = await probeBrowsers({
        engines: values.engine.split(','), systemChrome: values['system-chrome'], headless: !values['no-headless'],
    });
    const failed = results.filter(result => !result.ok);
    if (failed.length) throw new Error(failed.map(result => `${result.engine}: ${result.detail}`).join('\n'));
    return Object.fromEntries(results.map(result => [result.engine, result.detail]));
}

export function buildSubsets(options) {
    return options.runtime === 'coreclr' ? ['clr+libs+host', 'packs.product'] :
        ['mono+libs', ...(options.variant === 'aot' ? ['mono.aotcross'] : []), 'packs.product'];
}

export async function measurementRecord(manifestPath) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const logs = join(manifest.runDir, 'logs');
    const statuses = (await readdir(logs)).filter(name => name.endsWith('.status.json')).sort();
    if (!statuses.length) throw new Error(`No measurement status found for ${manifestPath}`);
    const status = JSON.parse(await readFile(join(logs, statuses.at(-1)), 'utf8'));
    if (status.status !== 'passed') throw new Error(`Measurement failed: ${status.error ?? manifestPath}`);
    const names = (await readdir(status.resultsDir)).filter(name => name.endsWith('.json') && name !== 'context.json');
    if (!names.length) throw new Error(`No measurement results found in ${status.resultsDir}`);
    const results = [];
    for (const name of names.sort()) {
        const path = join(status.resultsDir, name);
        const text = await readFile(path, 'utf8');
        const result = JSON.parse(text);
        const metrics = ['time-to-reach-managed-cold', 'time-to-reach-managed-warm'];
        if (result.meta?.engine === 'chrome' && result.meta?.profile === 'desktop') metrics.push('havit-walkthrough');
        for (const metric of metrics) {
            if (!(result.metrics[metric] > 0)) throw new Error(`Invalid baseline metric ${metric} in ${path}`);
        }
        results.push({ path, sha256: digest(text) });
    }
    return {
        manifestPath, sdkVersion: manifest.sdkInfo.sdkVersion,
        resultsDir: status.resultsDir, statusPath: join(logs, statuses.at(-1)), results,
    };
}

export async function loadBaseline(cachePath, key) {
    const text = await readOptional(cachePath);
    if (text === null) return null;
    const record = JSON.parse(text);
    if (!record || typeof record.key !== 'string' || !Array.isArray(record.results) ||
        typeof record.manifestPath !== 'string' || typeof record.statusPath !== 'string' ||
        typeof record.resultsDir !== 'string' ||
        record.results.some(result => typeof result?.path !== 'string' || typeof result?.sha256 !== 'string')) {
        throw new Error(`Invalid before cache: ${cachePath}. Remove this entry or use --force-before.`);
    }
    if (record.key !== key) return null;
    for (const file of [record.manifestPath, record.statusPath, ...record.results.map(result => result.path)]) {
        if (await readOptional(file) === null) {
            console.log(`Cached before evidence is missing: ${file}; rebuilding before.`);
            return null;
        }
    }
    if (JSON.parse(await readFile(record.statusPath, 'utf8')).status !== 'passed') {
        console.log('Cached before status is not passed; rebuilding before.');
        return null;
    }
    if (!record.results.length) throw new Error(`Invalid empty before cache: ${cachePath}`);
    for (const result of record.results) {
        if (digest(await readFile(result.path, 'utf8')) !== result.sha256) {
            console.log(`Cached before result changed: ${result.path}; rebuilding before.`);
            return null;
        }
    }
    return record;
}

export async function monoBaselineWarnings(record, setup) {
    const warnings = [];
    const manifest = JSON.parse(await readFile(record.manifestPath, 'utf8'));
    const expectedVariant = setup.monoVariant ?? setup.variant;
    if (manifest.variant !== expectedVariant) {
        warnings.push(`Mono before variant ${manifest.variant ?? 'unknown'} differs from expected Mono control ${expectedVariant}.`);
    }
    let configuration = manifest.configuration;
    if (!configuration && manifest.runDir) {
        const inputs = await readOptional(join(manifest.runDir, 'inputs.json'));
        if (inputs !== null) configuration = JSON.parse(inputs).options?.configuration;
    }
    if (configuration !== setup.configuration) {
        warnings.push(`Mono before configuration ${configuration ?? 'unknown'} does not match CoreCLR ${setup.configuration}.`);
    }
    const text = await readOptional(join(record.resultsDir, 'context.json'));
    if (text === null) {
        warnings.push('Mono before measurement options were not recorded; setup compatibility cannot be verified.');
    } else {
        const context = JSON.parse(text);
        const measured = {
            engine: context.engines?.slice().sort().join(','),
            profile: context.profiles?.slice().sort().join(','),
            'cold-runs': context.coldRuns, 'warm-runs': context.warmRuns,
            'walkthrough-runs': context.walkthroughRuns, timeout: context.timeout,
            retries: context.retries, 'deadline-minutes': context.deadlineMs / 60000,
            'no-headless': typeof context.headless === 'boolean' ? !context.headless : undefined,
            'system-chrome': context.chromiumChannel === 'chrome',
        };
        for (const [key, expected] of Object.entries(setup.measurement)) {
            if (key !== 'verbose' && measured[key] !== expected) {
                warnings.push(`Mono before --${key}=${measured[key] ?? 'unknown'} differs from CoreCLR ${expected}.`);
            }
        }
    }
    warnings.push('Mono before browser version and benchmark-source snapshot compatibility are not verified; ' +
        'confirm the same browser and Havit/harness sources before interpreting the headline.');
    return warnings;
}

async function baselineCheckout({ output, sessionDir, runtimeRepo, beforeSha, origin, runtime, configuration, run }) {
    const sourceSetup = { beforeSha, origin, runtime, configuration };
    const sourceDir = join(output, 'before-source');
    await mkdir(sourceDir, { recursive: true });
    const sourcePath = join(sourceDir, `${digest(JSON.stringify(sourceSetup))}.json`);
    const sourceText = await readOptional(sourcePath);
    let checkout;
    if (sourceText !== null) {
        const source = JSON.parse(sourceText);
        if (typeof source.checkout !== 'string' ||
            Object.entries(sourceSetup).some(([key, value]) => source[key] !== value)) {
            throw new Error(`Invalid baseline source record: ${sourcePath}`);
        }
        checkout = source.checkout;
        const changed = () => new Error(`Baseline source checkout was modified or moved outside this output directory: ${checkout}. ` +
            'Use a new --output or remove only the source record; no checkout will be reset.');
        if (!resolve(checkout).startsWith(`${output}${sep}`)) throw changed();
        let actual;
        try {
            actual = await realpath(checkout);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            console.log(`Cached baseline source was removed: ${checkout}; cloning a new pristine baseline.`);
            checkout = undefined;
        }
        if (checkout) {
            if (!actual.startsWith(`${await realpath(output)}${sep}`) ||
                git(checkout, ['rev-parse', 'HEAD']) !== beforeSha ||
                git(checkout, ['status', '--porcelain']) !== '' ||
                sourceRemote(git(checkout, ['remote', 'get-url', 'origin'])) !== origin) throw changed();
            console.log(statusLine(`Reuse pristine ${runtime} baseline source/build outputs: ${checkout}; before will still be measured`, 'CACHED'));
        }
    }
    if (!checkout) {
        checkout = join(sessionDir, runtime === 'mono' ? 'runtime-before-mono' : 'runtime-before');
        await run('git', ['clone', '--local', '--no-hardlinks', '--no-checkout', runtimeRepo, checkout], { cwd: sessionDir });
        // SourceLink must retain the source origin, not the local filesystem clone.
        git(checkout, ['remote', 'set-url', 'origin', origin]);
        await run('git', ['checkout', '--detach', beforeSha], { cwd: checkout });
        const temporary = join(sessionDir, `${runtime}-before-source.json`);
        await writeFile(temporary, JSON.stringify({ ...sourceSetup, checkout }, null, 2));
        await rename(temporary, sourcePath);
    }
    if (runtime === 'mono') {
        // Stop legacy ESLint from inheriting the enclosing benchmark repo's rules.
        await writeFile(join(dirname(checkout), '.eslintrc.cjs'), 'module.exports = { root: true };\n');
    }
    return checkout;
}

export async function compare(options, {
    run = runCommand, publishRuntime = publish, getBrowserIdentity = browserIdentity,
    getBenchmarkDigest = benchmarkDigest,
    registerResult = registerComparison,
    onSourceSelected = async () => {},
} = {}) {
    const output = resolve(options.output);
    await mkdir(output, { recursive: true });
    const lock = join(output, '.comparison-lock');
    try {
        await mkdir(lock);
    } catch (error) {
        if (error.code === 'EEXIST') throw new Error(`Another comparison is running, or a previous run was interrupted: ${lock}`);
        throw error;
    }
    try {
        const browsers = await getBrowserIdentity(options.measureArgs);
        const runtimeRepo = resolve(options['runtime-repo'] ?? join(output, `runtime-${options.runtime}`));
        if (!existsSync(runtimeRepo)) {
            if (options['runtime-repo']) throw new Error(`Runtime checkout not found: ${runtimeRepo}`);
            await run('git', ['clone', 'https://github.com/dotnet/runtime.git', runtimeRepo], { cwd: output });
            if (options['runtime-ref']) {
                const ref = git(runtimeRepo, ['rev-parse', '--verify', '--end-of-options', `${options['runtime-ref']}^{commit}`]);
                await run('git', ['checkout', '--detach', ref], { cwd: runtimeRepo });
            }
        } else if (options['runtime-ref']) {
            throw new Error(`Managed clone already exists: ${runtimeRepo}. Use --runtime-repo or a new --output; refusing to switch it.`);
        }
        const afterSha = git(runtimeRepo, ['rev-parse', 'HEAD']);
        await onSourceSelected({ runtimeRepo, commit: afterSha });
        const beforeSha = git(runtimeRepo, ['merge-base', 'HEAD', 'refs/remotes/origin/main']);
        const origin = sourceRemote(git(runtimeRepo, ['remote', 'get-url', 'origin']));
        let monoBefore;
        if (options['mono-before']) {
            monoBefore = await measurementRecord(resolve(options['mono-before']));
            const monoManifest = JSON.parse(await readFile(monoBefore.manifestPath, 'utf8'));
            if (monoManifest.runtime !== 'mono' || monoManifest.sdkInfo?.runtimeGitHash !== beforeSha ||
                monoManifest.sdkInfo?.localRuntime?.source?.dirty !== false) {
                throw new Error('--mono-before requires a measured pristine Mono source build at the same merge-base baseline commit.');
            }
        }
        console.log(`Before: ${beforeSha} (merge base with local origin/main, separate clean checkout)\nAfter: ${afterSha} plus working-tree changes in ${runtimeRepo}`);
        let sdkVersion = null;
        if (options.sdk) {
            const sdk = resolve(options.sdk);
            sdkVersion = execFileSync(join(sdk, process.platform === 'win32' ? 'dotnet.exe' : 'dotnet'),
                ['--version'], { cwd: sdk, encoding: 'utf8' }).trim();
        }
        const setup = {
            version: 1, beforeSha, beforeRef: 'refs/remotes/origin/main', baselineStrategy: 'merge-base', origin,
            runtime: options.runtime, variant: options['before-variant'] ?? options.variant,
            afterVariant: options.variant,
            configuration: options.configuration, sdk: options.sdk ? resolve(options.sdk) : null, sdkVersion,
            sdkBundledVersions: options.sdk ? digest(await readFile(join(resolve(options.sdk), 'sdk', sdkVersion,
                'Microsoft.NETCoreSdk.BundledVersions.props'))) : null,
            tfm: options.tfm ?? null, aspnetVersion: options['aspnet-version'] ?? null,
            excludedSources: [...new Set(options['exclude-source'] ?? [])].sort(),
            baselineGlobalJson: git(runtimeRepo, ['show', `${beforeSha}:global.json`]),
            measurement: { ...measurementOptions(options.measureArgs), verbose: undefined },
            platform: process.platform, osRelease: release(), host: hostname(),
            arch: process.arch, cpu: cpus()[0]?.model, logicalCpus: cpus().length, memory: totalmem(),
            node: process.versions.node, browser: browsers,
            benchmark: await getBenchmarkDigest(),
        };
        const warnings = monoBefore ? await monoBaselineWarnings(monoBefore, { ...setup, monoVariant: 'no-workload' }) : [];
        const key = digest(JSON.stringify({ ...setup, afterVariant: undefined }));
        const cacheDir = join(output, 'before');
        await mkdir(cacheDir, { recursive: true });
        const cachePath = join(cacheDir, `${key}.json`);
        let before = options['force-before'] ? null : await loadBaseline(cachePath, key);
        const sessionDir = await mkdtemp(join(output, 'comparison-'));
        await mkdir(join(sessionDir, 'logs'));
        const buildAndMeasure = async (checkout, label, runtime = options.runtime, variant = options.variant) => {
            const buildOptions = { ...options, runtime, variant };
            for (const subset of buildSubsets(buildOptions)) {
                const args = [subset, '-os', 'browser', '-arch', 'wasm', '-c', buildOptions.configuration,
                    `/p:RuntimeFlavor=${runtime === 'coreclr' ? 'CoreCLR' : 'Mono'}`];
                const command = process.platform === 'win32' ? 'cmd.exe' : 'bash';
                const commandArgs = process.platform === 'win32' ? ['/d', '/c', 'build.cmd', ...args] : ['./build.sh', ...args];
                await run(command, commandArgs, {
                    cwd: checkout, logPath: join(sessionDir, 'logs', `${label}-${subset.replaceAll('+', '-')}.log`),
                });
            }
            const manifest = await publishRuntime(parsePublishOptions(publishArgs(buildOptions, checkout, label)));
            return measurementRecord(manifest);
        };
        const measureBaseline = async (runtime, variant, label, baselineSetup) => {
            const baselineKey = digest(JSON.stringify({ ...baselineSetup, afterVariant: undefined }));
            const path = join(cacheDir, `${baselineKey}.json`);
            let record = options['force-before'] ? null : await loadBaseline(path, baselineKey);
            if (record) {
                console.log(statusLine(`${label} ${beforeSha}: reuse ${record.resultsDir}`, 'CACHED'));
                return record;
            }
            const checkout = await baselineCheckout({ output, sessionDir, runtimeRepo, beforeSha, origin, runtime,
                configuration: options.configuration, run });
            record = { key: baselineKey, setup: baselineSetup, ...await buildAndMeasure(checkout, label, runtime, variant) };
            const temporary = join(sessionDir, `${label}-cache.json`);
            await writeFile(temporary, JSON.stringify(record, null, 2) + '\n');
            await rename(temporary, path);
            return record;
        };
        if (options['include-mono-before'] && !monoBefore) {
            monoBefore = await measureBaseline('mono', 'no-workload', 'mono-before',
                { ...setup, runtime: 'mono', variant: 'no-workload', afterVariant: undefined });
        }
        if (before) {
            console.log(statusLine(`Before ${beforeSha}: reuse ${before.resultsDir}`, 'CACHED'));
        } else {
            before = await measureBaseline(options.runtime, setup.variant, 'before', setup);
        }
        const after = await buildAndMeasure(runtimeRepo, 'after');
        if (before.sdkVersion !== after.sdkVersion) {
            warnings.push(`Before SDK ${before.sdkVersion} differs from after SDK ${after.sdkVersion}. ` +
                'Use --sdk to hold the app SDK constant before interpreting this as a runtime-only comparison.');
        }
        if (monoBefore && monoBefore.sdkVersion !== after.sdkVersion) {
            warnings.push(`Mono before SDK ${monoBefore.sdkVersion} differs from CoreCLR after SDK ${after.sdkVersion}. ` +
                'This comparison does not hold the app SDK constant.');
        }
        const comparisonPath = join(sessionDir, 'comparison.json');
        const comparison = { setup, before, after, monoBefore, runtimeRepo, afterSha, warnings };
        await writeFile(comparisonPath, JSON.stringify(comparison, null, 2) + '\n');
        const dashboardPath = join(sessionDir, 'dashboard.json');
        const data = await writeLocalComparisonData(comparison, dashboardPath);
        await registerResult(comparisonPath);
        console.log(formatResults(data));
        console.log(`Before results: ${before.resultsDir}\nAfter results: ${after.resultsDir}\nComparison: ${comparisonPath}\nLocal dashboard data: ${dashboardPath}`);
        return { before, after, comparisonPath };
    } finally {
        await rmdir(lock);
    }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    try {
        const options = parseCompareOptions(process.argv.slice(2));
        if (options.help) console.log(help);
        else if (options['display-results'] !== undefined) {
            const path = options['display-results'] ? resolve(options['display-results'])
                : await findLatestComparison(options.resultsOutput);
            await displaySavedResults(path);
        }
        else {
            const measurement = measurementOptions(options.measureArgs);
            const prerequisites = await checkPrerequisites({
                runtimeRepo: options['runtime-repo'], sdk: options.sdk, engines: measurement.engine.split(','),
                systemChrome: measurement['system-chrome'], headless: !measurement['no-headless'],
            });
            reportPrerequisites(prerequisites);
            if (!prerequisites.ok) throw new Error('Prerequisites are missing or unusable. Follow the instructions above and rerun; nothing was installed.');
            if (!options['check-prerequisites']) {
                await compare(options, { getBrowserIdentity: async () => prerequisites.browsers });
            }
        }
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
