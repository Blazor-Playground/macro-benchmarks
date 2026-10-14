import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { measureBefore, measurementOptions } from './compare-local-runtime.mjs';
import { loadLocalComparisonData, writeLocalComparisonData } from './local-comparison-data.mjs';
import { formatResults, readCurrentComparison, readLegacyComparison, registerComparison } from './local-results.mjs';

const dayMs = 86_400_000;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();

async function optionalJson(path) {
    try { return JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function saveJson(path, value) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, JSON.stringify(value, null, 2) + '\n');
        await rename(temporary, path);
    } finally { await rm(temporary, { force: true }); }
}

export function recentDayCount(value) {
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new Error('--measure-recent-days requires a positive safe integer.');
    }
    return Number(value);
}

export function selectRecentCommits(runtimeRepo, count, now = new Date()) {
    recentDayCount(String(count));
    const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
    const start = today - (count - 1) * dayMs;
    if (!Number.isFinite(start) || start < Date.parse('0001-01-01T00:00:00Z')) {
        throw new Error('The requested recent-day range is outside supported UTC dates.');
    }
    const shallow = git(runtimeRepo, ['rev-parse', '--is-shallow-repository']) === 'true';
    const sourceRef = 'refs/remotes/origin/main';
    const selectedMain = git(runtimeRepo, ['rev-parse', '--verify', `${sourceRef}^{commit}`]);
    const commits = git(runtimeRepo, ['log', '--first-parent', '--format=%H%x09%ct', selectedMain])
        .split('\n').map(line => {
            const [commit, seconds] = line.split('\t');
            return { commit, time: Number(seconds) * 1000 };
        });
    const days = [];
    for (let time = start; time <= today; time += dayMs) {
        const day = new Date(time).toISOString().slice(0, 10);
        const cutoff = Math.min(time + dayMs - 1, now.getTime());
        const selected = commits.find(commit => commit.time <= cutoff);
        if (!selected) throw new Error(`No first-parent source snapshot available for ${day}. ` +
            `${shallow ? 'Deepen/unshallow the runtime checkout yourself, then retry. ' : ''}Nothing was measured.`);
        days.push({ day, commit: selected.commit });
    }
    return { sourceRef, selectedMain, sourceTipDate: new Date(commits[0].time).toISOString(),
        selectedAt: now.toISOString(), days };
}

async function historyCheckout({ output, runtimeRepo, beforeSha, origin, runtime, configuration, run }) {
    const directory = join(output, 'history', 'sources');
    await mkdir(directory, { recursive: true });
    if (!(await realpath(directory)).startsWith(`${await realpath(output)}${sep}`)) {
        throw new Error(`Historical source directory is outside the output: ${directory}`);
    }
    const id = hash({ origin, runtime, configuration });
    const marker = join(directory, `${id}.json`);
    let source = await optionalJson(marker);
    const checkout = join(directory, `runtime-${runtime}-${id.slice(0, 12)}`);
    if (source) {
        if (source.checkout !== checkout || source.origin !== origin ||
            source.runtime !== runtime || source.configuration !== configuration) {
            throw new Error(`Invalid owned historical source record: ${marker}`);
        }
        let actual;
        try { actual = await realpath(checkout); }
        catch (error) { if (error.code !== 'ENOENT') throw error; source = null; }
        if (source && (!actual.startsWith(`${await realpath(output)}${sep}`) ||
            git(checkout, ['status', '--porcelain']) !== '' ||
            ![source.commit, source.pendingCommit].includes(git(checkout, ['rev-parse', 'HEAD'])) ||
            git(checkout, ['remote', 'get-url', 'origin']) !== origin)) {
            throw new Error(`Owned historical source was modified or moved: ${checkout}. No checkout was reset.`);
        }
    }
    if (!source) {
        await run('git', ['clone', '--local', '--no-hardlinks', runtimeRepo, checkout], { cwd: directory });
        git(checkout, ['remote', 'set-url', 'origin', origin]);
        source = { checkout, commit: git(checkout, ['rev-parse', 'HEAD']), origin, runtime, configuration };
        await saveJson(marker, source);
    }
    if (source.commit !== beforeSha || source.pendingCommit) {
        // Copy newly fetched commits from the contributor's local repo, not a remote.
        await run('git', ['fetch', '--no-tags', runtimeRepo, beforeSha], { cwd: checkout });
        await saveJson(marker, { ...source, pendingCommit: beforeSha });
        await run('git', ['checkout', '--detach', beforeSha], { cwd: checkout });
        await saveJson(marker, { checkout, commit: beforeSha, origin, runtime, configuration });
    }
    if (runtime === 'mono') await writeFile(join(dirname(checkout), '.eslintrc.cjs'), 'module.exports = { root: true };\n');
    return checkout;
}

function checkSetup(options, comparison, data) {
    const checkout = data.after.manifest.sdkInfo.localRuntime?.source?.checkout ?? comparison.runtimeRepo;
    if (!checkout || resolve(checkout) !== resolve(options['runtime-repo'])) {
        throw new Error('The current after result belongs to another runtime checkout. Bootstrap that checkout or iterate first.');
    }
    if (options.variant !== data.after.manifest.variant || options['before-variant'] !== options.variant ||
        options.runtime !== data.after.manifest.runtime) {
        throw new Error('History must match the current after runtime mode. Run iterate with the desired variant first.');
    }
    const expected = {
        configuration: options.configuration, sdk: options.sdk ?? null, tfm: options.tfm ?? null,
        aspnetVersion: options['aspnet-version'] ?? null,
        excludedSources: [...new Set(options['exclude-source'] ?? [])].sort(),
    };
    for (const [key, value] of Object.entries(expected)) {
        if (JSON.stringify(comparison.setup?.[key]) !== JSON.stringify(value)) {
            throw new Error(`History ${key} differs from the current after setup. Run iterate with these options first.`);
        }
    }
    const measurement = measurementOptions(options.measureArgs);
    for (const [key, value] of Object.entries(measurement)) {
        if (key !== 'verbose' && comparison.setup?.measurement?.[key] !== value) {
            throw new Error(`History --${key} differs from the current after setup. Run iterate with these options first.`);
        }
    }
}

export async function collectRecentBefore(options, count, {
    now = () => new Date(), select = selectRecentCommits, measure = measureBefore,
    getCurrent = readCurrentComparison, getLegacy = readLegacyComparison, register = registerComparison,
    measurementDependencies = {},
} = {}) {
    let current = await getCurrent();
    const legacy = current === null;
    if (legacy) current = await getLegacy();
    if (!current) throw new Error('No current after result. Complete bootstrap or iterate before adding history.');
    const data = await loadLocalComparisonData(current.comparison);
    checkSetup(options, current.comparison, data);
    const plan = select(options['runtime-repo'], count, now());
    for (const selected of plan.days) {
        const previous = current.comparison.beforeHistory?.find(entry => entry.day === selected.day && entry.status === 'passed');
        if (!previous || previous.commit === selected.commit) continue;
        try {
            git(options['runtime-repo'], ['merge-base', '--is-ancestor', previous.commit, plan.selectedMain]);
        } catch (error) {
            if (typeof error.status !== 'number') throw error;
            throw new Error(`Local origin/main cannot preserve the saved ${selected.day} snapshot ${previous.commit}. ` +
                'Fetch/deepen the intended main history yourself before retrying; no saved dates were replaced.');
        }
    }
    const output = resolve(options.output);
    await mkdir(output, { recursive: true });
    const lock = join(output, '.history-lock');
    try { await mkdir(lock); }
    catch (error) {
        if (error.code === 'EEXIST') throw new Error(`Another history collection is running or was interrupted: ${lock}`);
        throw error;
    }
    try {
        if (existsSync(join(output, '.comparison-lock'))) {
            throw new Error(`Another comparison is running or was interrupted: ${join(output, '.comparison-lock')}`);
        }
        if (legacy) {
            if (await getCurrent()) throw new Error('The current result changed during legacy migration; retry.');
            await register(current.path);
            console.log(`Migrated saved after without remeasurement: ${current.path}`);
        }
        const directory = join(output, 'history');
        await mkdir(directory, { recursive: true });
        const progressPath = join(directory, `${hash({ selectedMain: plan.selectedMain, days: plan.days })}.json`);
        const old = await optionalJson(progressPath);
        if (old && (old.schemaVersion !== 1 || !Array.isArray(old.days) ||
            JSON.stringify(old.selection?.days) !== JSON.stringify(plan.days))) {
            throw new Error(`Invalid historical progress: ${progressPath}`);
        }
        const progress = { schemaVersion: 1, selection: old?.selection ?? plan, days: [], comparisonPath: current.path };
        console.log(`Daily before controls: ${plan.days[0].day} through ${plan.days.at(-1).day} (UTC, including today).\n` +
            `Pinned local origin/main: ${plan.selectedMain} (${plan.sourceTipDate}); after evidence remains ${current.path}`);
        const failures = [];
        for (const selected of plan.days) {
            const previous = old?.days.find(day => day.day === selected.day);
            const entry = { ...selected, status: 'running', attempts: (previous?.attempts ?? 0) + 1 };
            progress.days.push(entry);
            await saveJson(progressPath, progress);
            try {
                const controls = { ...options, 'mono-before': undefined, 'include-mono-before': false };
                const dependencies = { ...measurementDependencies, getBaselineCheckout: historyCheckout };
                if (current.comparison.monoBefore) {
                    const mono = await measure({ ...controls, runtime: 'mono', variant: 'no-workload',
                        'before-variant': 'no-workload' }, entry.commit, dependencies);
                    entry.monoBefore = mono.before;
                    await saveJson(progressPath, progress);
                }
                const result = await measure(controls, entry.commit, dependencies);
                entry.before = result.before;
                entry.status = 'passed';
                console.log(`Daily before ${entry.day} ${entry.commit}: passed (valid caches reused).`);
            } catch (error) {
                entry.status = 'failed';
                entry.error = error.message;
                failures.push(entry.day);
                console.error(`Daily before ${entry.day} ${entry.commit}: FAILED\n${error.message}`);
            }
            await saveJson(progressPath, progress);
        }
        const entries = new Map((current.comparison.beforeHistory ?? []).map(entry => [entry.day, entry]));
        for (const entry of progress.days) entries.set(entry.day, entry);
        const warnings = current.comparison.warnings.filter(warning =>
            !warning.startsWith('History uses local origin/main last committed '));
        if (plan.sourceTipDate.slice(0, 10) < plan.days.at(-1).day) {
            const warning = `History uses local origin/main last committed ${plan.sourceTipDate}. ` +
                'Unchanged source days share cached evidence; fetch origin/main yourself if newer upstream snapshots are needed.';
            console.warn(warning);
            warnings.push(warning);
        }
        if (progress.days.some(entry => entry.before && entry.before.setup?.benchmark !== current.comparison.setup.benchmark)) {
            warnings.push('Historical controls were collected with a different benchmark/harness snapshot from the fixed after; inspect saved setups before interpreting runtime-only changes.');
        }
        if (progress.days.some(entry => entry.before && entry.before.sdkVersion !== data.after.manifest.sdkInfo.sdkVersion)) {
            warnings.push('Some historical controls use a different app SDK from the fixed after. Recorded SDKs remain in their manifests.');
        }
        if (progress.days.some(entry => entry.before &&
            JSON.stringify(entry.before.setup?.browser) !== JSON.stringify(current.comparison.setup.browser))) {
            warnings.push('Historical controls and the fixed after have different recorded browser versions; do not treat this as a browser-controlled runtime-only comparison.');
        }
        const comparison = {
            ...current.comparison, warnings: [...new Set(warnings)],
            beforeHistory: [...entries.values()].sort((left, right) => left.day.localeCompare(right.day)),
            historySelection: progress.selection,
        };
        delete comparison.historySelections;
        const session = await mkdtemp(join(output, 'comparison-'));
        const comparisonPath = join(session, 'comparison.json');
        await saveJson(comparisonPath, comparison);
        const portable = await writeLocalComparisonData(comparison, join(session, 'dashboard.json'));
        if ((await getCurrent())?.path !== current.path) {
            throw new Error('The current after changed during history collection. Saved controls are retained; retry to attach them without overwriting a newer result.');
        }
        await register(comparisonPath);
        console.log(formatResults(portable));
        console.log(`Current comparison (CLI and local viewer): ${comparisonPath}\nHistorical progress: ${progressPath}`);
        if (failures.length) throw new Error(`Historical controls failed for ${failures.join(', ')}. Explicit gaps were saved; repeat bootstrap --measure-recent-days=${count} to retry using valid caches.`);
        return { comparisonPath, selection: progress.selection, beforeHistory: comparison.beforeHistory };
    } finally { await rmdir(lock); }
}
