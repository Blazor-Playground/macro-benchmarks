import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { cloneOptions, measureBefore, measurementOptions } from './compare-local-runtime.mjs';
import { loadLocalComparisonData, writeLocalComparisonData } from './local-comparison-data.mjs';
import { formatResults, readCurrentComparison, readLegacyComparison, registerComparison } from './local-results.mjs';

const dayMs = 86_400_000;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const registerHistory = (path, options) => registerComparison(path, undefined, options);
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

export function historyDate(value, now = new Date()) {
    if (value === 'today') return now.toISOString().slice(0, 10);
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') {
        throw new Error('History dates must be YYYY-MM-DD or today (UTC).');
    }
    const time = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
        throw new Error(`Invalid UTC history date: ${value}`);
    }
    return value;
}

export function historyRange(from, to = from, now = new Date()) {
    from = historyDate(from, now);
    to = historyDate(to, now);
    if (from > to) throw new Error('History --from must not be after --to.');
    const days = [];
    for (let time = Date.parse(`${from}T00:00:00Z`); time <= Date.parse(`${to}T00:00:00Z`); time += dayMs) {
        days.push(new Date(time).toISOString().slice(0, 10));
    }
    return { from, to, days };
}

function includesMono(comparison) {
    return !!comparison.monoBefore ||
        comparison.beforeHistory?.some(entry => !!entry.monoBefore);
}

export function latestBeforeDay(comparison) {
    const mono = includesMono(comparison);
    return comparison.beforeHistory?.filter(entry =>
        entry.status === 'passed' && entry.before && (!mono || entry.monoBefore))
        .map(entry => entry.day).sort().at(-1);
}

export function missingBeforeDays(comparison, from, to, now = new Date()) {
    const range = historyRange(from, to, now);
    if (range.to > now.toISOString().slice(0, 10)) throw new Error('Cannot measure future history dates.');
    const mono = includesMono(comparison);
    return range.days.filter(day => !comparison.beforeHistory?.some(entry =>
        entry.day === day && entry.status === 'passed' && entry.before && (!mono || entry.monoBefore)));
}

function selectDays(runtimeRepo, days, now) {
    const sourceRef = 'refs/remotes/origin/main';
    if (!days.length) return { sourceRef, selectedMain: null, sourceTipDate: null, selectedAt: now.toISOString(), days: [] };
    const shallow = git(runtimeRepo, ['rev-parse', '--is-shallow-repository']) === 'true';
    const selectedMain = git(runtimeRepo, ['rev-parse', '--verify', `${sourceRef}^{commit}`]);
    const commits = git(runtimeRepo, ['log', '--first-parent', '--format=%H%x09%ct', selectedMain])
        .split('\n').map(line => {
            const [commit, seconds] = line.split('\t');
            return { commit, time: Number(seconds) * 1000 };
        });
    const selectedDays = [];
    for (const day of days) {
        const time = Date.parse(`${day}T00:00:00Z`);
        const cutoff = Math.min(time + dayMs - 1, now.getTime());
        const selected = commits.find(commit => commit.time <= cutoff);
        if (!selected) throw new Error(`No first-parent source snapshot available for ${day}. ` +
            `${shallow ? 'Deepen/unshallow the runtime checkout yourself, then retry. ' : ''}Nothing was measured.`);
        selectedDays.push({ day, commit: selected.commit });
    }
    return { sourceRef, selectedMain, sourceTipDate: new Date(commits[0].time).toISOString(),
        selectedAt: now.toISOString(), days: selectedDays };
}

export function selectRecentCommits(runtimeRepo, count, now = new Date()) {
    recentDayCount(String(count));
    const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
    const start = today - (count - 1) * dayMs;
    if (!Number.isFinite(start) || start < Date.parse('0001-01-01T00:00:00Z')) {
        throw new Error('The requested recent-day range is outside supported UTC dates.');
    }
    return selectDays(runtimeRepo, historyRange(new Date(start).toISOString().slice(0, 10),
        now.toISOString().slice(0, 10), now).days, now);
}

export function selectRangeCommits(runtimeRepo, from, to, now = new Date(), comparison = {}) {
    const range = historyRange(from, to, now);
    const missing = missingBeforeDays(comparison, range.from, range.to, now);
    return { ...selectDays(runtimeRepo, missing.reverse(), now), requestedRange: { from: range.from, to: range.to } };
}

async function lockHistory(output) {
    await mkdir(output, { recursive: true });
    const lock = join(output, '.history-lock');
    try { await mkdir(lock); }
    catch (error) {
        if (error.code === 'EEXIST') throw new Error(`Another history edit/collection is running or was interrupted: ${lock}`);
        throw error;
    }
    if (existsSync(join(output, '.comparison-lock'))) {
        await rmdir(lock);
        throw new Error(`Another comparison is running or was interrupted: ${join(output, '.comparison-lock')}`);
    }
    return () => rmdir(lock);
}

async function publishHistory(current, comparison, output, getCurrent, register) {
    const session = await mkdtemp(join(output, 'comparison-'));
    const comparisonPath = join(session, 'comparison.json');
    await saveJson(comparisonPath, comparison);
    const portable = await writeLocalComparisonData(comparison, join(session, 'dashboard.json'));
    if ((await getCurrent())?.path !== current.path) {
        throw new Error('The current after changed during history collection/editing. Saved evidence is retained; retry without overwriting the newer result.');
    }
    await register(comparisonPath, { expectedCurrentPath: current.path });
    console.log(formatResults(portable));
    return comparisonPath;
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
        await run('git', ['clone', '--local', '--no-hardlinks', runtimeRepo, checkout, ...cloneOptions], { cwd: directory });
        git(checkout, ['remote', 'set-url', 'origin', origin]);
        source = { checkout, commit: git(checkout, ['rev-parse', 'HEAD']), origin, runtime, configuration };
        await saveJson(marker, source);
    }
    if (source.commit !== beforeSha || source.pendingCommit) {
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
    getCurrent = readCurrentComparison, getLegacy = readLegacyComparison, register = registerHistory,
    measurementDependencies = {},
} = {}) {
    let current = await getCurrent();
    const legacy = current === null;
    if (legacy) current = await getLegacy();
    if (!current) throw new Error('No current after result. Complete bootstrap or iterate before adding history.');
    const data = await loadLocalComparisonData(current.comparison);
    checkSetup(options, current.comparison, data);
    const includeMono = includesMono(current.comparison);
    const plan = select(options['runtime-repo'], count, now(), current.comparison);
    if (!plan.days.length) {
        console.log('All requested before-history dates are already measured; existing results are unchanged.');
        return { comparisonPath: current.path, selection: plan, beforeHistory: current.comparison.beforeHistory ?? [] };
    }
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
    const unlock = await lockHistory(output);
    try {
        if (legacy) {
            if (await getCurrent()) throw new Error('The current result changed during legacy migration; retry.');
            await register(current.path, { expectedCurrentPath: null });
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
        console.log(`Daily before controls (UTC, in capture order): ${plan.days.map(day => day.day).join(', ')}.\n` +
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
                if (includeMono) {
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
        const retryWarnings = [];
        for (const entry of progress.days) {
            const saved = entries.get(entry.day);
            if (entry.status !== 'passed' && saved?.status === 'passed') {
                retryWarnings.push(`History retry failed for ${entry.day}: ${entry.commit.slice(0, 12)} failed; ` +
                    `retained saved controls at ${saved.commit.slice(0, 12)}. ${entry.error}`);
            } else {
                entries.set(entry.day, entry);
            }
        }
        const warnings = current.comparison.warnings.filter(warning =>
            !warning.startsWith('History uses local origin/main last committed ') &&
            !progress.days.some(entry => warning.startsWith(`History retry failed for ${entry.day}:`)));
        warnings.push(...retryWarnings);
        const latestDay = plan.days.map(day => day.day).sort().at(-1);
        if (plan.sourceTipDate.slice(0, 10) < latestDay) {
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
        const comparisonPath = await publishHistory(current, comparison, output, getCurrent, register);
        console.log(`Current comparison (CLI and local viewer): ${comparisonPath}\nHistorical progress: ${progressPath}`);
        if (failures.length) {
            const retry = plan.requestedRange
                ? `node bench/runtime-bench.mjs history add --from ${plan.requestedRange.from} --to ${plan.requestedRange.to}`
                : `bootstrap --measure-recent-days=${count}`;
            throw new Error(`Historical controls failed for ${failures.join(', ')}. Explicit gaps or prior valid controls were saved; repeat ${retry} to retry using valid caches.`);
        }
        return { comparisonPath, selection: progress.selection, beforeHistory: comparison.beforeHistory };
    } finally { await unlock(); }
}

export async function collectBeforeRange(options, from, to = from, dependencies = {}) {
    const stamp = (dependencies.now ?? (() => new Date()))();
    const range = historyRange(from, to, stamp);
    return collectRecentBefore(options, range.days.length, {
        ...dependencies, now: () => stamp,
        select: dependencies.select ?? ((runtimeRepo, count, now, comparison) =>
            selectRangeCommits(runtimeRepo, range.from, range.to, now, comparison)),
    });
}

export async function dropBeforeRange({ output, from, to = from, all = false, dryRun = false }, {
    getCurrent = readCurrentComparison, register = registerHistory, now = () => new Date(),
} = {}) {
    if (all && (from !== undefined || to !== undefined)) throw new Error('Use either a date range or --all, not both.');
    const range = all ? null : historyRange(from, to, now());
    const current = await getCurrent();
    if (!current) throw new Error('No current comparison. Run bootstrap or iterate first.');
    const history = current.comparison.beforeHistory ?? [];
    if (!Array.isArray(history)) throw new Error('Invalid comparison history records.');
    if (history.some(entry => !entry || typeof entry.day !== 'string')) {
        throw new Error('Invalid comparison history entry.');
    }
    const removed = history.filter(entry =>
        all || (entry.day >= range.from && entry.day <= range.to));
    if (!removed.length) {
        await loadLocalComparisonData(current.comparison);
        console.log('No active before-history dates match; results are unchanged.');
        return { comparisonPath: current.path, removedDays: [] };
    }
    const removedDays = new Set(removed.map(entry => entry.day));
    const comparison = {
        ...current.comparison,
        beforeHistory: history.filter(entry => !removedDays.has(entry.day)),
        warnings: [...new Set([...(current.comparison.warnings ?? []).filter(warning =>
            ![...removedDays].some(day => warning.startsWith(`History retry failed for ${day}:`))),
            'History was manually edited; raw measurements and before caches were retained.'])],
    };
    if (comparison.historySelection) {
        comparison.historySelection = {
            ...comparison.historySelection,
            days: comparison.historySelection.days.filter(entry => !removedDays.has(entry.day)),
        };
        if (!comparison.historySelection.days.length) delete comparison.historySelection;
    }
    if (!comparison.beforeHistory.length) {
        delete comparison.beforeHistory;
        delete comparison.historySelection;
        delete comparison.historySelections;
    }
    await loadLocalComparisonData(comparison);
    console.log(`${dryRun ? 'Would remove' : 'Removing'} from active history: ${[...removedDays].join(', ')}. Raw files and caches are retained.`);
    if (dryRun) return { comparisonPath: current.path, removedDays: [...removedDays], dryRun: true };
    output = resolve(output);
    const unlock = await lockHistory(output);
    try {
        const comparisonPath = await publishHistory(current, comparison, output, getCurrent, register);
        console.log(`Current comparison: ${comparisonPath}\nPrevious comparison retained: ${current.path}`);
        return { comparisonPath, removedDays: [...removedDays] };
    } finally { await unlock(); }
}
