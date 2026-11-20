import { FocusPublicationError } from './focus-types.js';
import { DEFAULT_FOCUS_SELECTION, focusRowKeys, resolveFocusCohort, resolveFocusSelection } from './focus-selection.js';
import type {
    FocusColumn, FocusComparison, FocusMetricDefinition, FocusMetricReport,
    FocusObservation, FocusPoint, FocusPublication, FocusRange, FocusReport, FocusSelection, FocusWindow,
} from './focus-types.js';

export const FOCUS_WINDOW_SIZE = 5;

const WALKTHROUGHS: Readonly<Record<string, string>> = {
    'havit-bootstrap': 'havit-walkthrough',
    'blazing-pizza': 'pizza-walkthrough',
    'mud-blazor': 'mud-walkthrough',
    'igniteui-light': 'igniteui-walkthrough',
    'radzen-blazor': 'radzen-walkthrough',
    'semi-avalonia': 'semi-walkthrough',
    'uno-gallery': 'uno-walkthrough',
};

export function focusMetrics(app: string): FocusMetricDefinition[] {
    return [
        { id: 'startup', title: 'Cold startup', key: 'time-to-reach-managed-cold', unit: 'ms', divisor: 1,
            description: 'Time to managed (cold): time-to-reach-managed-cold. JS bootstrap to managed-ready, not time to create .NET or navigation-to-LCP.' },
        { id: 'walkthrough', title: 'Walkthrough', key: WALKTHROUGHS[app] ?? null, unit: 's', divisor: 1000,
            description: 'App-specific scripted navigation; initial page load is excluded.' },
        { id: 'download', title: 'Cold download size', key: 'download-size-cold', unit: 'MiB', divisor: 1_048_576,
            description: 'First cold-load encoded bytes, displayed in binary MiB (1 MiB = 1,048,576 bytes).' },
        { id: 'build', title: 'Build time', key: 'compile-time', unit: 's', divisor: 1000,
            description: 'Clean publish duration, excluding the preceding restore and SDK/workload installation.' },
    ];
}

export function isSdk12(column: FocusColumn): boolean {
    return column.major === 12 && column.channel === '12.0' && column.sdkVersion.startsWith('12.');
}

export function isEligible(column: FocusColumn): boolean {
    return isSdk12(column) && column.isRuntimeCustomBuild !== true && column.isAspnetCoreCustomBuild !== true;
}

export function isMonoGa(column: FocusColumn): boolean {
    return column.major === 11 && column.channel === '11.0' && /^11\.0\.\d+$/.test(column.sdkVersion)
        && (!column.runtimePackVersion || /^11\.0\.\d+$/.test(column.runtimePackVersion))
        && (!column.bundledFrameworkTfm || column.bundledFrameworkTfm === 'net11.0')
        && column.isRuntimeCustomBuild !== true && column.isAspnetCoreCustomBuild !== true;
}

export function isPositive(value: number | null): value is number {
    return value !== null && Number.isFinite(value) && value > 0;
}

export function percentVsMono(coreclr: number | null, mono: number | null): number | null {
    if (!isPositive(coreclr) || !isPositive(mono)) return null;
    const percent = 100 * (coreclr / mono - 1);
    return Number.isFinite(percent) ? percent : null;
}

export function comparisonLabel(value: number, unit: FocusMetricDefinition['unit']): FocusComparison {
    if (!Number.isFinite(value)) throw new RangeError('A comparison must be finite.');
    const rounded = Math.abs(value).toFixed(1);
    if (Number(rounded) === 0) return { value, magnitude: '0.0%', verdict: 'same', tone: 'neutral' };
    return {
        value, magnitude: `${rounded}%`,
        verdict: unit === 'MiB' ? (value > 0 ? 'larger' : 'smaller') : (value > 0 ? 'slower' : 'faster'),
        tone: value > 0 ? 'worse' : 'better',
    };
}

export function formatFocusValue(value: number | null, metric: Pick<FocusMetricDefinition, 'unit' | 'divisor'>): string {
    if (value === null || !Number.isFinite(value)) return 'Not available';
    const converted = value / metric.divisor;
    return `${converted.toLocaleString('en-US', {
        minimumFractionDigits: metric.unit === 'ms' ? 0 : 2,
        maximumFractionDigits: metric.unit === 'ms' ? 1 : 2,
    })} ${metric.unit}`;
}

export function signedPercent(value: number): string {
    const rounded = Number(value.toFixed(1));
    return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}%`;
}

export function historyBounds(range: FocusRange, now: Date): { startDay: string; endDay: string } {
    if (!Number.isFinite(now.getTime())) throw new RangeError('The current date is invalid.');
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = new Date(end);
    if (range === '14d') {
        start.setUTCDate(start.getUTCDate() - 13);
    } else {
        const months = { '1m': 1, '3m': 3, '6m': 6, '12m': 12 }[range];
        if (!months) throw new RangeError(`Unsupported history range: ${range}`);
        const day = start.getUTCDate();
        start.setUTCDate(1);
        start.setUTCMonth(start.getUTCMonth() - months);
        const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
        start.setUTCDate(Math.min(day, lastDay));
    }
    return { startDay: start.toISOString().slice(0, 10), endDay: end.toISOString().slice(0, 10) };
}

function variantKey(column: FocusColumn): string {
    const identity = [
        column.sdkVersion, column.sdkGitHash, column.vmrGitHash, column.runtimeGitHash, column.aspnetCoreGitHash,
        column.runtimePackVersion, column.aspnetCoreVersion, column.workloadVersion, column.bootstrapSdkVersion,
        column.bundledFrameworkTfm, column.channel, column.isRuntimeCustomBuild, column.isAspnetCoreCustomBuild,
        column.runtimePR, column.aspnetCorePR,
    ];
    return JSON.stringify(column.runtimeSources === undefined ? identity : [...identity,
        ...(['mono', 'coreclr'] as const).map(runtime => {
            const source = column.runtimeSources?.[runtime];
            return source ? [source.repo, source.ref, source.commit, source.sdkVersion,
                source.targetFramework, source.runtimePackVersion] : null;
        })]);
}

function baselineSources(column: FocusColumn): FocusPoint['baselineSources'] {
    if (column.runtimeSources === undefined) return undefined;
    const result: NonNullable<FocusPoint['baselineSources']> = {};
    for (const runtime of ['mono', 'coreclr'] as const) {
        const source = column.runtimeSources[runtime];
        if (!source) continue;
        result[runtime] = {
            repo: source.repo, ref: source.ref, commit: source.commit,
            sdk: source.sdkVersion ?? null, tfm: source.targetFramework ?? null,
            committedAt: source.committedAt, commitAuthor: source.commitAuthor, commitMessage: source.commitMessage,
            runtimePackVersion: source.runtimePackVersion ?? null,
        };
    }
    return result;
}

export function orderObservations(a: FocusObservation, b: FocusObservation): number {
    return a.day.localeCompare(b.day)
        || a.sdkVersion.localeCompare(b.sdkVersion, 'en', { numeric: true })
        || a.id.localeCompare(b.id);
}

export function rollingWindows(values: readonly (number | null)[], observations: readonly { sdkVersion: string; day: string }[],
    size = FOCUS_WINDOW_SIZE, groups?: readonly string[]): (FocusWindow | null)[] {
    if (!Number.isInteger(size) || size < 1) throw new RangeError('Window size must be a positive integer.');
    if (values.length !== observations.length) throw new RangeError('Every value needs an observation.');
    if (groups && groups.length !== values.length) throw new RangeError('Every value needs a baseline group.');
    let window: number[] = [];
    return values.map((value, index) => {
        if (groups && index > 0 && groups[index] !== groups[index - 1]) window = [];
        if (value === null || !Number.isFinite(value)) {
            window = [];
            return null;
        }
        window.push(value);
        if (window.length > size) window.shift();
        const first = observations[index - window.length + 1];
        const last = observations[index];
        return {
            mean: window.reduce((sum, item) => sum + item / window.length, 0),
            min: Math.min(...window), max: Math.max(...window), count: window.length,
            firstSdk: first.sdkVersion, lastSdk: last.sdkVersion, firstDay: first.day, lastDay: last.day,
        };
    });
}

function pairIssue(coreclr: number | null, mono: number | null, percent: number | null): string | null {
    if (mono !== null && !isPositive(mono)) return 'Invalid Mono baseline: a finite positive value is required.';
    if (coreclr !== null && !isPositive(coreclr)) return 'Invalid CoreCLR measurement: a finite positive value is required.';
    if (mono === null && coreclr === null) return 'Neither runtime has a measurement in this cohort.';
    if (mono === null) return 'Mono measurement missing; no baseline was substituted.';
    if (coreclr === null) return 'CoreCLR measurement missing; no runtime was substituted.';
    return percent === null ? 'The comparison exceeds the finite numeric range.' : null;
}

function observationFor(column: FocusColumn, bucket: string, columnIndex: number): FocusObservation {
    return {
        id: variantKey(column), sdkVersion: column.sdkVersion, day: column.releaseDate,
        sdkCommitDateTime: column.sdkCommitDateTime, runtimeCommitDateTime: column.runtimeCommitDateTime,
        sdkGitHash: column.sdkGitHash || null, runtimeGitHash: column.runtimeGitHash || null,
        runtimePackVersion: column.runtimePackVersion, vmrGitHash: column.vmrGitHash || null,
        vmrCommitDateTime: column.vmrCommitDateTime, runtimeCommitAuthor: column.runtimeCommitAuthor ?? null,
        runtimeCommitMessage: column.runtimeCommitMessage ?? null, measuredAt: null, sourceId: null,
        bucket, columnIndex, variant: column,
    };
}

export function buildFocusReport(publication: FocusPublication, app: string, range: FocusRange, now = new Date(), selection: FocusSelection = DEFAULT_FOCUS_SELECTION): FocusReport {
    const flavor = resolveFocusSelection(selection);
    if (!publication.index.apps.includes(app)) throw new FocusPublicationError(`Application '${app}' is not in the published index.`);
    const { startDay, endDay } = historyBounds(range, now);
    const buckets = new Map(publication.buckets.map(bucket => [bucket.path, bucket]));
    const observations: FocusObservation[] = [];
    const monoGa: FocusObservation[] = [];
    const seen = new Set<string>();
    let excludedCustomBuilds = 0;
    for (const bucket of publication.buckets) {
        bucket.header.columns.forEach((column, columnIndex) => {
            if (isMonoGa(column) && column.releaseDate <= endDay) {
                monoGa.push(observationFor(column, bucket.path, columnIndex));
            }
            if (!isSdk12(column)) return;
            if (!isEligible(column)) {
                excludedCustomBuilds++;
                return;
            }
            const id = variantKey(column);
            if (seen.has(id)) throw new FocusPublicationError(`Duplicate SDK/variant identity in ${bucket.path}: ${column.sdkVersion}. Retry the publication.`);
            seen.add(id);
            observations.push(observationFor(column, bucket.path, columnIndex));
        });
    }
    observations.sort(orderObservations);
    monoGa.sort((a, b) => a.sdkVersion.localeCompare(b.sdkVersion, 'en', { numeric: true }) || orderObservations(a, b));
    const cohort = resolveFocusCohort(flavor, publication.buckets
        .filter(bucket => bucket.header.columns.some(isEligible))
        .flatMap(bucket => (bucket.header.apps[app] ?? []).flatMap(key => Object.keys(bucket.metrics[key] ?? {}))));
    if (observations.some(observation => {
        const sources = observation.variant.runtimeSources;
        return sources?.mono && sources.coreclr &&
            (sources.mono.repo !== sources.coreclr.repo || sources.mono.ref !== sources.coreclr.ref ||
                sources.mono.commit !== sources.coreclr.commit);
    })) {
        cohort.baselineDescription += ' Some observations use independently pinned runtime sources, not a same-source pair; per-point tooltips show the source and SDK/TFM for each arm.';
    }

    const metrics: FocusMetricReport[] = focusMetrics(app).map(definition => {
        const profile = definition.id === 'startup' ? selection.startupProfile : 'desktop';
        const rowKeys = focusRowKeys(cohort, profile);
        const gaBaseline = [...monoGa].reverse().find(observation => {
            const bucket = buckets.get(observation.bucket)!;
            if (!definition.key || !(bucket.header.apps[app] ?? []).includes(definition.key)) return false;
            const rows = bucket.metrics[definition.key];
            if (!rows) throw new FocusPublicationError(`Advertised ${app}/${definition.key} was not loaded from ${bucket.path}.`);
            return isPositive(rows[rowKeys.mono]?.[observation.columnIndex] ?? null);
        });
        const gaValue = gaBaseline && definition.key
            ? buckets.get(gaBaseline.bucket)!.metrics[definition.key][rowKeys.mono][gaBaseline.columnIndex] : null;
        let advertised = false;
        let hasCohortRows = false;
        const allPoints: FocusPoint[] = observations.map(observation => {
            const bucket = buckets.get(observation.bucket)!;
            const available = definition.key !== null && (bucket.header.apps[app] ?? []).includes(definition.key);
            const rows = available && definition.key ? bucket.metrics[definition.key] : undefined;
            if (available && !rows) throw new FocusPublicationError(`Advertised ${app}/${definition.key} was not loaded from ${bucket.path}.`);
            advertised ||= available;
            hasCohortRows ||= !!rows && (rowKeys.mono in rows || rowKeys.coreclr in rows);
            const recordedMono = rows?.[rowKeys.mono]?.[observation.columnIndex] ?? null;
            const coreclr = rows?.[rowKeys.coreclr]?.[observation.columnIndex] ?? null;
            const monoBaseline = recordedMono === null && isPositive(coreclr) ? gaBaseline : undefined;
            const mono = monoBaseline ? gaValue! : recordedMono;
            const percent = percentVsMono(coreclr, mono);
            const environments = (runtime: 'mono' | 'coreclr') => {
                const source = runtime === 'mono' && monoBaseline ? monoBaseline : observation;
                const row = rowKeys[runtime];
                return definition.key ? buckets.get(source.bucket)!.environments?.[definition.key]?.[row]?.[source.columnIndex] ?? undefined : undefined;
            };
            const sources = baselineSources(observation.variant);
            if (monoBaseline && sources) {
                const monoSource = baselineSources(monoBaseline.variant)?.mono;
                if (monoSource) sources.mono = monoSource;
                else delete sources.mono;
            }
            return { observation, position: 0, mono, coreclr, percent,
                ...(monoBaseline ? { monoBaseline } : {}),
                ...(sources === undefined ? {} : { baselineSources: sources }),
                environments: { mono: environments('mono'), coreclr: environments('coreclr') },
                issue: monoBaseline ? `Mono .NET11 GA baseline: SDK ${monoBaseline.sdkVersion}, ${monoBaseline.day}.`
                    : pairIssue(coreclr, mono, percent),
                monoWindow: null, coreclrWindow: null, percentWindow: null };
        });
        // Compute before date cropping: the first visible point keeps its preceding four observations.
        const baselineGroups = allPoints.map(p => p.monoBaseline?.id ?? 'sdk12');
        const monoWindows = rollingWindows(allPoints.map(p => isPositive(p.mono) ? p.mono : null), observations, FOCUS_WINDOW_SIZE, baselineGroups);
        const coreclrWindows = rollingWindows(allPoints.map(p => isPositive(p.coreclr) ? p.coreclr : null), observations);
        const percentWindows = rollingWindows(allPoints.map(p => p.percent), observations, FOCUS_WINDOW_SIZE, baselineGroups);
        allPoints.forEach((point, i) => {
            point.monoWindow = point.monoBaseline ? {
                mean: point.mono!, min: point.mono!, max: point.mono!, count: 1,
                firstSdk: point.monoBaseline.sdkVersion, lastSdk: point.monoBaseline.sdkVersion,
                firstDay: point.monoBaseline.day, lastDay: point.monoBaseline.day,
            } : monoWindows[i];
            point.coreclrWindow = coreclrWindows[i];
            point.percentWindow = percentWindows[i];
        });
        const points = allPoints.filter(point => point.observation.day >= startDay && point.observation.day <= endDay);
        points.forEach((point, position) => { point.position = position; });
        const pairs = points.filter(point => point.percent !== null);
        const latest = pairs.at(-1) ?? null;
        let status: FocusMetricReport['status'] = 'ready';
        let message = '';
        if (observations.length === 0) {
            status = 'no-history';
            message = 'No eligible SDK 12 builds are published. Older SDK channels are not substituted.';
        } else if (!definition.key || !advertised) {
            status = 'unsupported-metric';
            message = !definition.key
                ? 'This app has no equivalent elapsed-time walkthrough. Throughput scores are not substituted.'
                : 'This metric is not published for this app in eligible SDK 12 builds.';
        } else if (!hasCohortRows) {
            status = 'unsupported-cohort';
            message = `No ${cohort.coreclrLabel} / ${cohort.monoLabel} ${profile}/Chromium rows. Selected preset/profile gaps stay missing.`;
        } else if (points.length === 0) {
            status = 'no-history';
            message = 'No eligible SDK 12 builds in this date range. Older results are not carried forward.';
        } else if (!latest) {
            status = points.some(point => (point.mono !== null && !isPositive(point.mono))
                || (point.coreclr !== null && !isPositive(point.coreclr))) ? 'invalid-value' : 'incomplete-pair';
            const noCoreclr = points.every(point => point.coreclr === null);
            const noMono = points.every(point => point.mono === null);
            const missing = noCoreclr && noMono ? `Both ${cohort.coreclrLabel} and ${cohort.monoLabel} measurements are missing.`
                : noCoreclr ? `${cohort.coreclrLabel} measurements are missing.`
                    : noMono ? `${cohort.monoLabel} measurements are missing.`
                        : 'No same-SDK runtime measurements overlap.';
            message = status === 'invalid-value'
                ? 'Comparison unavailable: both runtime values must be finite and positive; the Mono baseline cannot be zero.'
                : `No complete ${profile}/Chromium pair in this range. ${missing} Selected preset/profile gaps stay missing.`;
        }
        return {
            ...definition, profile, coreclrPreset: cohort.coreclrPreset, monoPreset: cohort.monoPreset,
            coreclrLabel: cohort.coreclrLabel, monoLabel: cohort.monoLabel,
            coreclrRowKey: rowKeys.coreclr, monoRowKey: rowKeys.mono,
            description: `${definition.description} ${cohort.coreclrLabel} vs ${cohort.monoLabel}; ${profile}/Chromium. ${
                profile === 'mobile' ? 'Mobile emulation: 3x CPU slowdown, 20 Mbps download, 5 Mbps upload, 70 ms latency.'
                    : 'Desktop: no CPU or network throttling.'} ${cohort.baselineDescription}`,
            status, message, points, latest, pairCount: pairs.length,
            comparison: latest?.percent !== null && latest?.percent !== undefined ? comparisonLabel(latest.percent, definition.unit) : null,
            averageComparison: latest?.percentWindow ? comparisonLabel(latest.percentWindow.mean, definition.unit) : null,
            hasNewerIncomplete: latest !== null && latest.position < points.length - 1,
            ageDays: latest ? Math.round((Date.parse(endDay) - Date.parse(latest.observation.day)) / 86_400_000) : null,
        };
    });
    const knownObservations = observations.filter(observation => observation.day <= endDay);
    return {
        app, apps: publication.index.apps, flavor: selection.flavor, flavorLabel: flavor.label, cohort, startupProfile: selection.startupProfile,
        range, startDay, endDay, lastUpdated: publication.index.lastUpdated,
        targetFrameworks: [...new Set(knownObservations.flatMap(o => o.variant.runtimeSources === undefined
            ? [o.variant.bundledFrameworkTfm ?? 'Unknown']
            : Object.values(o.variant.runtimeSources).map(source => source?.targetFramework ?? 'Unknown')))].sort(),
        availableStartDay: knownObservations[0]?.day ?? null,
        availableEndDay: knownObservations.at(-1)?.day ?? null,
        excludedCustomBuilds, metrics,
    };
}
