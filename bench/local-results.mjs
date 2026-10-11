import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { styleText } from 'node:util';
import { loadLocalComparisonData } from './local-comparison-data.mjs';
import { terminalStylesEnabled } from './local-command.mjs';

const artifactsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'artifacts');

export async function registerComparison(path, artifacts = artifactsRoot) {
    const directory = join(artifacts, 'local-runtime', 'comparison-index');
    await mkdir(directory, { recursive: true });
    const name = createHash('sha256').update(resolve(path)).digest('hex');
    const temporary = join(directory, `${name}-${randomUUID()}.tmp`);
    try {
        await writeFile(temporary, JSON.stringify({ path: resolve(path) }));
        await rename(temporary, join(directory, `${name}.json`));
    } finally {
        await rm(temporary, { force: true });
    }
}

async function entries(path) {
    try {
        return await readdir(path, { withFileTypes: true });
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
}

export async function findLatestComparison(output, artifacts = artifactsRoot, writeWarning = console.warn) {
    const candidates = new Set();
    const indexed = new Set();
    const collect = async directory => {
        for (const entry of await entries(directory)) {
            if (entry.isFile() && entry.name === 'comparison.json') candidates.add(join(directory, entry.name));
            if (entry.isDirectory() && entry.name.startsWith('comparison-')) {
                for (const file of await entries(join(directory, entry.name))) {
                    if (file.isFile() && file.name === 'comparison.json') candidates.add(join(directory, entry.name, file.name));
                }
            }
        }
    };
    if (output) {
        await collect(resolve(output));
    } else {
        const index = join(artifacts, 'local-runtime', 'comparison-index');
        for (const entry of await entries(index)) {
            if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
            const record = JSON.parse(await readFile(join(index, entry.name), 'utf8'));
            if (typeof record.path !== 'string') throw new Error(`Invalid comparison index entry: ${entry.name}`);
            candidates.add(record.path);
            indexed.add(record.path);
        }
        await collect(join(artifacts, 'local-runtime-comparisons'));
        // Discover earlier unregistered local runs without traversing runtime sources/build outputs.
        for (const entry of await entries(artifacts)) {
            if (entry.isDirectory()) await collect(join(artifacts, entry.name, 'comparisons'));
        }
    }
    let latest;
    let measuredAt = -Infinity;
    for (const path of [...candidates].sort()) {
        let text;
        try {
            text = await readFile(path, 'utf8');
        } catch (error) {
            if (error.code !== 'ENOENT' || !indexed.has(path)) throw error;
            writeWarning(`Skipping removed comparison from saved index: ${path}`);
            continue;
        }
        const comparison = JSON.parse(text);
        if (!comparison.after?.results?.length) throw new Error(`No after measurement evidence in ${path}`);
        let timestamp = -Infinity;
        for (const file of comparison.after.results) {
            const result = JSON.parse(await readFile(file.path, 'utf8'));
            const time = Date.parse(result.meta?.benchmarkDateTime);
            if (!Number.isFinite(time)) throw new Error(`Missing valid measurement timestamp in ${file.path}`);
            timestamp = Math.max(timestamp, time);
        }
        if (timestamp > measuredAt) { measuredAt = timestamp; latest = path; }
    }
    if (!latest) throw new Error('No measured comparisons found. Supply --display-results <comparison.json> or select a results directory with --output.');
    return latest;
}
const metrics = [
    { title: 'Cold startup', profile: 'mobile', key: 'time-to-reach-managed-cold', unit: 'ms', divisor: 1 },
    { title: 'Walkthrough', profile: 'desktop', key: 'havit-walkthrough', unit: 's', divisor: 1000 },
    { title: 'Cold download', profile: 'desktop', key: 'download-size-cold', unit: 'MB', divisor: 1_000_000 },
    { title: 'Havit publish', profile: 'desktop', key: 'compile-time', unit: 's', divisor: 1000 },
];

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const runtimeName = runtime => runtime === 'coreclr' ? 'CoreCLR' : runtime === 'mono' ? 'Mono' : 'Runtime';

export function variantName(manifest) {
    const variant = manifest.variant ?? manifest.preset;
    if (variant === 'no-workload') return 'interpreter';
    if (variant === 'composite' && manifest.runtime === 'coreclr') return 'publish/R2R composite';
    if (variant === 'aot') return manifest.runtime === 'coreclr' ? 'publish/R2R' : 'publish/AOT';
    return 'unknown variant';
}

function change(after, before, unit) {
    if (!positive(after) || !positive(before)) return 'unavailable';
    const percent = 100 * (after / before - 1);
    if (!Number.isFinite(percent)) return 'unavailable';
    if (Math.abs(percent).toFixed(1) === '0.0') return '0.0% same';
    return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}% ` +
        (unit === 'MB' ? percent > 0 ? 'larger' : 'smaller' : percent > 0 ? 'slower' : 'faster');
}

function format(value, metric) {
    if (!positive(value)) return 'unavailable';
    return `${(value / metric.divisor).toLocaleString('en-US', {
        minimumFractionDigits: metric.unit === 'ms' ? 0 : metric.unit === 'MB' ? 3 : 2,
        maximumFractionDigits: metric.unit === 'ms' ? 1 : metric.unit === 'MB' ? 3 : 2,
    })} ${metric.unit}`;
}

function table(rows, emphasize, emphasizeChange, emphasizedColumns) {
    const widths = rows[0].map((_, index) => Math.max(...rows.map(row => row[index].length)));
    return rows.map((row, index) => [
        row.map((cell, column) => (emphasizedColumns.has(column)
            ? index === 0 ? emphasize(cell) : emphasizeChange(cell) : cell) +
            ' '.repeat(widths[column] - cell.length)).join('  ').trimEnd(),
        ...(index === 0 ? [widths.map(width => '-'.repeat(width)).join('  ')] : []),
    ]).flat().join('\n');
}

export function formatResults(data, { bold = terminalStylesEnabled(), color = terminalStylesEnabled() } = {}) {
    const emphasize = text => {
        const white = color ? styleText('white', text, { validateStream: false }) : text;
        return bold ? styleText('bold', white, { validateStream: false }) : white;
    };
    const emphasizeChange = text => {
        const value = parseFloat(text);
        const tone = Number.isFinite(value) && value !== 0 ? value < 0 ? 'green' : 'red' : 'white';
        const painted = color ? styleText(tone, text, { validateStream: false }) : text;
        return bold ? styleText('bold', painted, { validateStream: false }) : painted;
    };
    const side = (position, run) => [`${runtimeName(run.manifest.runtime)} ${position} (${variantName(run.manifest)})`, run];
    const sides = data.monoBefore
        ? [side('before', data.monoBefore), side('before', data.before), side('after', data.after)]
        : [side('before', data.before), side('after', data.after)];
    const primaryName = data.monoBefore ? 'CoreCLR after / Mono before' : 'after / before';
    const lines = ['\n=== Local runtime measurement summary ==='];
    const definitions = [`${emphasize('NET12 focus')}: 100 * (${primaryName} - 1). Negative means faster/smaller.`];
    if (data.monoBefore) {
        if (data.before.manifest.runtime !== 'coreclr' || data.after.manifest.runtime !== 'coreclr' ||
            data.monoBefore.manifest.runtime !== 'mono') throw new Error('A Mono control requires CoreCLR before/after and Mono before.');
        definitions.push(`${emphasize('CoreCLR change')}: 100 * (CoreCLR after / CoreCLR before - 1).`);
    }
    for (const warning of data.warnings ?? []) lines.push(`WARNING: ${warning}`);
    for (const [label, run] of sides) {
        if (!Array.isArray(run.results) || !run.results.length) throw new Error(`No saved measurement results for ${label}.`);
        lines.push(`${label}: SDK ${run.manifest.sdkInfo.sdkVersion}; TFM ${run.manifest.sdkInfo.bundledFrameworkTfm ?? 'unknown'}; ` +
            `runtime pack ${run.manifest.sdkInfo.runtimePackVersion ?? 'unknown'}`);
        const source = run.manifest.sdkInfo.localRuntime?.source;
        lines.push(`  Checkout: ${source?.checkout ?? run.checkout ?? 'unavailable (not recorded)'}`);
        lines.push(`  Commit: ${source?.hash ?? run.manifest.sdkInfo.runtimeGitHash ?? 'unavailable (not recorded)'}`);
        lines.push(`  Uncommitted changes at publish: ${source?.dirty === true
            ? 'yes (measured with working-tree changes)' : source?.dirty === false
                ? 'no (clean checkout)' : 'unknown (not recorded)'}`);
    }
    const groups = new Map();
    for (const [label, run] of sides) {
        for (const result of run.results) {
            if (!result.meta?.engine || !result.meta.profile || !result.metrics) throw new Error(`Invalid saved result for ${label}.`);
            const id = `${result.meta.engine}/${result.meta.profile}`;
            if (!groups.has(id)) groups.set(id, new Map());
            const group = groups.get(id);
            if (group.has(label)) throw new Error(`Duplicate saved ${id} result for ${label}.`);
            group.set(label, result);
        }
    }
    const engines = [...new Set([...groups.keys()].map(key => key.split('/')[0]))].sort();
    for (const engine of engines) {
        const groupFor = profile => groups.get(`${engine}/${profile}`) ?? new Map();
        lines.push(`\nHavit / ${engine} / NET12 focus`);
        lines.push(`Profiles: startup ${engine}/mobile; other metrics ${engine}/desktop.`);
        const headers = ['NET12 focus', ...(data.monoBefore ? ['CoreCLR change'] : []),
            'Metric', ...sides.map(([label]) => label)];
        const rows = [headers];
        for (const metric of metrics) {
            const group = groupFor(metric.profile);
            const before = group.get(sides[data.monoBefore ? 1 : 0][0]);
            const after = group.get(sides.at(-1)[0]);
            const reference = group.get(sides[0][0]);
            rows.push([
                change(after?.metrics[metric.key], reference?.metrics[metric.key], metric.unit),
                ...(data.monoBefore ? [change(after?.metrics[metric.key], before?.metrics[metric.key], metric.unit)] : []),
                `${metric.title} (${metric.profile})`,
                ...sides.map(([label]) => format(group.get(label)?.metrics[metric.key], metric)),
            ]);
        }
        const emphasizedColumns = new Set([headers.indexOf('NET12 focus')]);
        if (data.monoBefore) emphasizedColumns.add(headers.indexOf('CoreCLR change'));
        lines.push(table(rows, emphasize, emphasizeChange, emphasizedColumns));
        lines.push('', ...definitions);
        for (const [label] of sides) {
            const startup = groupFor('mobile').get(label);
            const desktop = groupFor('desktop').get(label);
            lines.push(`Samples ${label}: mobile cold ${startup?.samples?.['time-to-reach-managed-cold'] ?? 'unknown'}, ` +
                `warm ${startup?.samples?.['time-to-reach-managed-warm'] ?? 'unknown'}; ` +
                `desktop walkthrough ${desktop?.samples?.['havit-walkthrough'] ?? 'unknown'}`);
            if (!startup) lines.push(`WARNING: ${label} ${engine}/mobile startup row unavailable; no desktop fallback.`);
            if (!desktop) lines.push(`WARNING: ${label} ${engine}/desktop metric rows unavailable; no mobile fallback.`);
        }
    }
    lines.push('\nStartup values are recorded aggregates, not significance estimates. Publish time excludes restore and runtime source builds.');
    return lines.join('\n');
}

export async function displaySavedResults(path, writeLine = console.log) {
    const comparison = JSON.parse(await readFile(path, 'utf8'));
    const data = await loadLocalComparisonData(comparison);
    writeLine(formatResults(data));
    writeLine(`\nSaved comparison: ${path}`);
    return data;
}
