import { comparisonLabel, focusMetrics, percentVsMono } from './focus-data.js';
import type { FocusColumn, FocusMetricReport, FocusPoint, FocusProfile, FocusReport } from './focus-types.js';
import { DEFAULT_FOCUS_SELECTION } from './focus-selection.js';

interface LocalResult {
    meta: { app: string; runtime: string; preset: string; engine: string; profile: string; benchmarkDateTime: string };
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
    before: LocalRun; after: LocalRun;
    monoBefore?: LocalRun;
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

export function localFocusReport(raw: unknown, profile: FocusProfile = DEFAULT_FOCUS_SELECTION.startupProfile) {
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
    return {
        status: 'ready', report,
        metadata: {
            title: data.title, note: data.note ?? '', runtime, variant: data.after.manifest.variant, profiles,
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
