import { comparisonLabel, focusMetrics, percentVsMono } from './focus-data.js';
import type { FocusColumn, FocusMetricReport, FocusPoint, FocusProfile, FocusReport } from './focus-types.js';
import { DEFAULT_FOCUS_SELECTION } from './focus-selection.js';

interface LocalResult {
    meta: { app: string; runtime: string; preset: string; engine: string; profile: string; benchmarkDateTime: string;
        timingAggregation?: { rounds?: number } };
    metrics: Record<string, number>;
    samples?: Record<string, number>;
}
interface LocalRun {
    manifest: {
        runtime: string; preset: 'no-workload' | 'aot'; variant: string;
        sdkInfo: Record<string, unknown> & { sdkVersion: string; runtimeGitHash: string; runtimePackVersion: string };
    };
    results: LocalResult[];
}
interface LocalData {
    schemaVersion: number; title: string; note?: string; createdAt: string; warnings: string[];
    comparisonPath?: string;
    before: LocalRun; after: LocalRun;
    monoBefore?: LocalRun;
    beforeHistory?: LocalHistoryEntry[];
}
interface LocalHistoryEntry {
    day: string; commit: string; status: 'pending' | 'running' | 'passed' | 'failed';
    error?: string; before?: LocalRun; monoBefore?: LocalRun;
}
function validateRun(run: LocalRun, side: string): void {
    if (!run?.manifest || !['coreclr', 'mono'].includes(run.manifest.runtime) ||
        !['no-workload', 'aot'].includes(run.manifest.preset) ||
        !['no-workload', 'aot', 'composite'].includes(run.manifest.variant) || !run.manifest.sdkInfo ||
        typeof run.manifest.sdkInfo.sdkVersion !== 'string' || typeof run.manifest.sdkInfo.runtimeGitHash !== 'string' ||
        typeof run.manifest.sdkInfo.runtimePackVersion !== 'string' || !Array.isArray(run.results) || !run.results.length) {
        throw new Error(`Invalid ${side} local runtime evidence.`);
    }
    if (run.manifest.preset !== (run.manifest.variant === 'no-workload' ? 'no-workload' : 'aot') ||
        (run.manifest.runtime === 'mono' && run.manifest.variant === 'composite')) {
        throw new Error(`Invalid ${side} local runtime variant/preset pairing.`);
    }
    const rows = new Set<string>();
    for (const result of run.results) {
        if (!result?.meta || result.meta.app !== 'havit-bootstrap' || result.meta.runtime !== run.manifest.runtime ||
            result.meta.preset !== run.manifest.preset || !result.metrics || !Number.isFinite(Date.parse(result.meta.benchmarkDateTime))) {
            throw new Error(`Invalid ${side} Havit result.`);
        }
        const key = `${result.meta.engine}/${result.meta.profile}`;
        if (rows.has(key)) throw new Error(`Duplicate ${side} local row ${key}.`);
        rows.add(key);
        const rounds = result.meta.timingAggregation?.rounds;
        if (rounds !== undefined && (!Number.isInteger(rounds) || rounds < 1)) {
            throw new Error(`Invalid ${side} recorded aggregation count.`);
        }
    }
}

function resultFor(run: LocalRun, profile: string): LocalResult | undefined {
    return run.results.find(result => result.meta.engine === 'chrome' && result.meta.profile === profile);
}
function positive(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
function dirty(run: LocalRun): boolean | null {
    const local = run.manifest.sdkInfo.localRuntime as { source?: { dirty?: unknown } } | undefined;
    return typeof local?.source?.dirty === 'boolean' ? local.source.dirty : null;
}

function mode(run: LocalRun): string {
    if (run.manifest.variant === 'no-workload') return 'interpreter';
    if (run.manifest.variant === 'composite') return 'publish/R2R composite';
    return run.manifest.runtime === 'coreclr' ? 'publish/R2R' : 'publish/AOT';
}

export function localFocusReport(raw: unknown, profile: FocusProfile = DEFAULT_FOCUS_SELECTION.startupProfile, view: 'history' | 'matched' = 'history') {
    const data = raw as LocalData;
    if (!['history', 'matched'].includes(view)) throw new Error('Select historical baselines or a matched pair.');
    if (view === 'matched') {
        const result = localSingleReport(raw, profile);
        if (data.before.manifest.sdkInfo.runtimeGitHash !== data.after.manifest.sdkInfo.runtimeGitHash ||
            dirty(data.before) !== false || data.before.manifest.variant !== data.after.manifest.variant) {
            throw new Error('A matched pair requires a clean before at the same base commit and runtime mode as after.');
        }
        return { ...result, metadata: { ...result.metadata, title: `${data.title} · Matched pair`,
            note: 'Same base commit and runtime mode; before is clean, after includes the recorded local changes.' } };
    }
    if (data?.beforeHistory !== undefined) return localHistoryReport(data, profile);
    return localSingleReport(raw, profile);
}

function localSingleReport(raw: unknown, profile: FocusProfile) {
    const data = raw as LocalData;
    if (!data || data.schemaVersion !== 1 || typeof data.title !== 'string' ||
        (data.note !== undefined && typeof data.note !== 'string') ||
        !Number.isFinite(Date.parse(data.createdAt)) || !Array.isArray(data.warnings) ||
        data.warnings.some(warning => typeof warning !== 'string')) throw new Error('Invalid local comparison bundle.');
    validateRun(data.before, 'before');
    validateRun(data.after, 'after');
    if (data.monoBefore) {
        validateRun(data.monoBefore, 'Mono before');
        if (data.after.manifest.runtime !== 'coreclr' || data.monoBefore.manifest.runtime !== 'mono' ||
            data.monoBefore.manifest.sdkInfo.runtimeGitHash !== data.before.manifest.sdkInfo.runtimeGitHash ||
            dirty(data.monoBefore) !== false) {
            throw new Error('Mono before must be a pristine source build at the same baseline commit as CoreCLR before.');
        }

    }

    if (data.before.manifest.runtime !== data.after.manifest.runtime) {
        throw new Error('Before and after must use the same runtime.');
    }
    const reference = data.monoBefore ?? data.before;
    const profiles = ['desktop', 'mobile'].filter(value => resultFor(data.before, value) &&
        resultFor(data.after, value) && resultFor(reference, value));
    if (!profiles.includes(profile)) throw new Error(`No paired Chromium ${profile} measurements in this local comparison.`);
    const runtime = data.after.manifest.runtime === 'coreclr' ? 'CoreCLR' : 'Mono';
    const coreclrBeforeLabel = `Before (${runtime} ${mode(data.before)})`;
    const monoLabel = data.monoBefore ? `Before (Mono ${mode(data.monoBefore)})` : '';
    const beforeLabel = data.monoBefore ? monoLabel : coreclrBeforeLabel;
    const afterLabel = `After (${runtime} ${mode(data.after)})`;
    const preset = data.after.manifest.preset;
    const source = data.after.manifest.sdkInfo;
    const day = resultFor(data.after, profile)!.meta.benchmarkDateTime.slice(0, 10);
    const variant: FocusColumn = {
        sdkVersion: source.sdkVersion, major: Number(source.major), channel: String(source.channel ?? ''),
        releaseDate: String(source.releaseDate ?? ''), sdkGitHash: String(source.sdkGitHash ?? ''),
        vmrGitHash: String(source.vmrGitHash ?? ''), runtimeGitHash: source.runtimeGitHash,
        aspnetCoreGitHash: String(source.aspnetCoreGitHash ?? ''), runtimePackVersion: source.runtimePackVersion,
        aspnetCoreVersion: typeof source.aspnetCoreVersion === 'string' ? source.aspnetCoreVersion : null,
        workloadVersion: typeof source.workloadVersion === 'string' ? source.workloadVersion : null,
        bootstrapSdkVersion: typeof source.bootstrapSdkVersion === 'string' ? source.bootstrapSdkVersion : null,
        bundledFrameworkTfm: typeof source.bundledFrameworkTfm === 'string' ? source.bundledFrameworkTfm : null,
        runtimeCommitDateTime: typeof source.runtimeCommitDateTime === 'string' ? source.runtimeCommitDateTime : null,
        isRuntimeCustomBuild: true, isAspnetCoreCustomBuild: null, runtimePR: null, aspnetCorePR: null,
    };
    const observation = { id: 'local-before-after', sdkVersion: source.sdkVersion, day, bucket: 'local',
        columnIndex: 0, variant };
    const metrics: FocusMetricReport[] = focusMetrics('havit-bootstrap').map(metric => {
        const metricProfile = metric.id === 'startup' ? profile : 'desktop';
        const before = resultFor(data.before, metricProfile);
        const after = resultFor(data.after, metricProfile);
        const baseline = resultFor(reference, metricProfile);
        const beforeValue = metric.key ? positive(baseline?.metrics[metric.key]) : null;
        const coreclrBefore = data.monoBefore && metric.key ? positive(before?.metrics[metric.key]) : null;
        const afterValue = metric.key ? positive(after?.metrics[metric.key]) : null;
        const percent = percentVsMono(afterValue, beforeValue);
        const secondaryPercent = data.monoBefore ? percentVsMono(afterValue, coreclrBefore) : null;
        const point: FocusPoint = { observation, position: 0, coreclr: afterValue, mono: beforeValue, coreclrBefore,
            percent, issue: null, coreclrWindow: null, monoWindow: null, percentWindow: null };
        return {
            ...metric, profile: metricProfile, coreclrPreset: preset, monoPreset: reference.manifest.preset,
            coreclrLabel: afterLabel, monoLabel: beforeLabel,
            comparisonLabel: data.monoBefore ? 'CoreCLR after vs Mono before (%)' : 'After vs before (%)',
            coreclrBeforeLabel: data.monoBefore ? coreclrBeforeLabel : undefined,
            secondaryComparison: secondaryPercent === null ? null : comparisonLabel(secondaryPercent, metric.unit),
            coreclrRowKey: `after/${data.after.manifest.runtime}/${data.after.manifest.variant}/${metricProfile}/chrome`,
            monoRowKey: `before/${reference.manifest.runtime}/${reference.manifest.variant}/${metricProfile}/chrome`,
            status: percent === null ? 'incomplete-pair' : 'ready',
            message: percent === null ? 'This metric has no complete local before/after pair.' : '',
            points: [point], latest: percent === null ? null : point,
            comparison: percent === null ? null : comparisonLabel(percent, metric.unit),
            averageComparison: null, hasNewerIncomplete: false, pairCount: percent === null ? 0 : 1, ageDays: null,
        };
    });
    const report: FocusReport = {
        comparisonKind: 'local', app: 'havit-bootstrap', apps: ['havit-bootstrap'], range: '14d',
        flavor: 'release-release', flavorLabel: 'After versus before', startupProfile: profile,
        startDay: day, endDay: day, lastUpdated: data.createdAt,
        targetFrameworks: [...new Set([data.before, data.after].map(run => String(run.manifest.sdkInfo.bundledFrameworkTfm ?? 'Unknown')))],
        availableStartDay: day, availableEndDay: day, excludedCustomBuilds: 0,
        cohort: { baselinePreset: reference.manifest.preset === 'no-workload' ? 'no-workload' : null,
            usesBaseline: reference.manifest.preset === 'no-workload',
            baselineDescription: 'Explicit local merge-base baseline, not published SDK history.',
            coreclrPreset: preset, monoPreset: reference.manifest.preset, coreclrLabel: afterLabel, monoLabel: beforeLabel },
        metrics,
    };
    const beforeResult = resultFor(data.before, profile)!;
    const afterResult = resultFor(data.after, profile)!;
    const rounds = afterResult.meta.timingAggregation?.rounds ?? null;
    if (rounds !== null && (!Number.isInteger(rounds) || rounds < 1)) throw new Error('Invalid recorded after aggregation count.');
    return {
        status: 'ready', report,
        metadata: {
            title: data.title, note: data.note ?? '', runtime, variant: data.after.manifest.variant, profiles,
            hasHistory: Array.isArray(data.beforeHistory), isHistory: false,
            comparisonPath: data.comparisonPath ?? '',
            afterMeasuredAt: new Date(afterResult.meta.benchmarkDateTime).toISOString(), afterRounds: rounds,
            beforeLabel: coreclrBeforeLabel, afterLabel, monoLabel,
            hasMonoReference: !!data.monoBefore,
            primaryFormula: data.monoBefore ? '100 × (CoreCLR after / Mono before − 1)' : '100 × (after / before − 1)',
            monoCommit: data.monoBefore?.manifest.sdkInfo.runtimeGitHash ?? '',
            monoSdk: data.monoBefore?.manifest.sdkInfo.sdkVersion ?? '',
            monoPack: data.monoBefore?.manifest.sdkInfo.runtimePackVersion ?? '',
            monoColdSamples: data.monoBefore ? resultFor(data.monoBefore, profile)?.samples?.['time-to-reach-managed-cold'] ?? null : null,
            beforeCommit: data.before.manifest.sdkInfo.runtimeGitHash, afterCommit: source.runtimeGitHash,
            beforeDirty: dirty(data.before), afterDirty: dirty(data.after),
            beforeSdk: data.before.manifest.sdkInfo.sdkVersion, afterSdk: source.sdkVersion,
            beforePack: data.before.manifest.sdkInfo.runtimePackVersion, afterPack: source.runtimePackVersion,
            beforeColdSamples: beforeResult.samples?.['time-to-reach-managed-cold'] ?? null,
            afterColdSamples: afterResult.samples?.['time-to-reach-managed-cold'] ?? null,
            beforeWarm: positive(beforeResult.metrics['time-to-reach-managed-warm']),
            afterWarm: positive(afterResult.metrics['time-to-reach-managed-warm']),
            warnings: data.warnings,
        },
    };
}

function localHistoryReport(data: LocalData, profile: FocusProfile) {
    if (!Array.isArray(data.beforeHistory) || !data.beforeHistory.length) throw new Error('Invalid local baseline history.');
    const days = [...data.beforeHistory].sort((a, b) => a.day.localeCompare(b.day));
    const seen = new Set<string>();
    const withMono = days.some(entry => entry.status === 'passed' && !!entry.monoBefore);
    const reports = days.map(entry => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.day) ||
            !Number.isFinite(Date.parse(entry.day)) || new Date(entry.day).toISOString().slice(0, 10) !== entry.day || seen.has(entry.day) ||
            !/^[a-f0-9]{40}$/i.test(entry.commit) || !['pending', 'running', 'passed', 'failed'].includes(entry.status)) {
            throw new Error('Invalid or duplicate daily baseline entry.');
        }
        seen.add(entry.day);
        if (entry.status !== 'passed') return null;
        if (!!entry.monoBefore !== withMono) throw new Error('Daily baseline history must consistently include matched Mono controls.');
        if (!entry.before || entry.before.manifest.sdkInfo.runtimeGitHash !== entry.commit || dirty(entry.before) !== false ||
            entry.before.manifest.variant !== data.after.manifest.variant) {
            throw new Error(`Daily baseline ${entry.day} must be a clean matching-mode source build.`);
        }
        return localSingleReport({ ...data, beforeHistory: undefined, before: entry.before,
            monoBefore: entry.monoBefore }, profile);
    });
    let latestIndex = -1;
    reports.forEach((report, index) => { if (report) latestIndex = index; });
    const latest = latestIndex < 0 ? localSingleReport({ ...data, beforeHistory: undefined }, profile) : reports[latestIndex]!;
    const failed = days.filter(entry => entry.status === 'failed');
    const metrics = latest.report.metrics.map((metric, metricIndex) => {
        const points = days.map((entry, index): FocusPoint => {
            const original = reports[index]?.report.metrics[metricIndex].points[0];
            const baseline = entry.before?.manifest.sdkInfo;
            const observation = { ...(original?.observation ?? metric.points[0].observation),
                id: `local-main-${entry.day}-${entry.commit}`, day: entry.day, columnIndex: index,
                sdkVersion: baseline?.sdkVersion ?? 'Unmeasured',
                variant: { ...metric.points[0].observation.variant,
                    sdkVersion: baseline?.sdkVersion ?? 'Unmeasured', runtimeGitHash: entry.commit,
                    runtimePackVersion: baseline?.runtimePackVersion ?? '',
                    bundledFrameworkTfm: typeof baseline?.bundledFrameworkTfm === 'string' ? baseline.bundledFrameworkTfm : null } };
            return original ? { ...original, position: index, observation, coreclr: null } : {
                position: index, observation, coreclr: null, mono: null, coreclrBefore: null, percent: null,
                issue: null, coreclrWindow: null, monoWindow: null, percentWindow: null,
            };
        });
        const last = latestIndex < 0 ? null : points[latestIndex];
        const afterRow = resultFor(data.after, metric.profile);
        const reference = afterRow ? { value: metric.key ? positive(afterRow.metrics[metric.key]) : null,
            label: metric.coreclrLabel.replace('After (', 'After reference ('),
            measuredAt: new Date(afterRow.meta.benchmarkDateTime).toISOString(), sdkVersion: data.after.manifest.sdkInfo.sdkVersion,
            commit: data.after.manifest.sdkInfo.runtimeGitHash, dirty: dirty(data.after),
            rounds: afterRow.meta.timingAggregation?.rounds ?? null } : undefined;
        return { ...metric, points, latest: metric.latest ? last : null,
            fixedReference: reference, coreclrLabel: reference?.label ?? metric.coreclrLabel,
            comparisonLabel: withMono ? 'Fixed after reference vs historical Mono baseline (%)'
                : 'Fixed after reference vs historical baseline (%)',
            status: last && metric.comparison ? 'ready' as const : 'incomplete-pair' as const,
            comparison: last ? metric.comparison : null,
            secondaryComparison: last ? metric.secondaryComparison : null,
            pairCount: points.filter(point => point.percent !== null).length,
            hasNewerIncomplete: latestIndex >= 0 && latestIndex < days.length - 1,
            message: latestIndex < 0 ? 'No daily baseline has completed successfully.' : metric.message };
    });
    return {
        ...latest,
        report: { ...latest.report, metrics, startDay: days[0].day, endDay: days.at(-1)!.day,
            availableStartDay: days[0].day, availableEndDay: days.at(-1)!.day,
            cohort: { ...latest.report.cohort,
                baselineDescription: 'Daily UTC main source snapshots compared with a separately measured fixed after reference.' } },
        metadata: { ...latest.metadata, title: data.title, isHistory: true, hasHistory: true,
            afterLabel: latest.metadata.afterLabel.replace('After (', 'After reference ('),
            note: `${data.note ?? ''} Daily baselines: ${reports.filter(Boolean).length}/${days.length} passed. ` +
                'The dashed after line is one fixed reference from its recorded tree, not an observation on each source date.',
            warnings: [...latest.metadata.warnings.filter(warning =>
                !failed.some(entry => warning.startsWith(`${entry.day} ${entry.commit}:`))), ...failed
                .map(day => `${day.day}: ${day.status}${day.error ? ` — ${day.error}` : ''}`)] },
    };
}
