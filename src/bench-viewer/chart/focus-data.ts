import { FocusPublicationError } from './focus-types.js';
import { DEFAULT_FOCUS_SELECTION, focusRowKeys, resolveFocusSelection } from './focus-selection.js';
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
    'semi-avalonia': 'semi-walkthrough',
    'uno-gallery': 'uno-walkthrough',
};

export function focusMetrics(app: string): FocusMetricDefinition[] {
    return [
        { id: 'startup', title: 'Cold startup', key: 'time-to-reach-managed-cold', unit: 'ms', divisor: 1,
            description: 'Time to managed (cold): time-to-reach-managed-cold. JS bootstrap to managed-ready, not time to create .NET or navigation-to-LCP.' },
        { id: 'walkthrough', title: 'Walkthrough', key: WALKTHROUGHS[app] ?? null, unit: 's', divisor: 1000,
            description: 'App-specific scripted navigation; initial page load is excluded.' },
        { id: 'download', title: 'Cold download size', key: 'download-size-cold', unit: 'MB', divisor: 1_000_000,
            description: 'First cold-load encoded bytes, displayed in decimal MB (1 MB = 1,000,000 bytes).' },
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
        verdict: unit === 'MB' ? (value > 0 ? 'larger' : 'smaller') : (value > 0 ? 'slower' : 'faster'),
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
    return JSON.stringify([
        column.sdkVersion, column.sdkGitHash, column.vmrGitHash, column.runtimeGitHash, column.aspnetCoreGitHash,
        column.runtimePackVersion, column.aspnetCoreVersion, column.workloadVersion, column.bootstrapSdkVersion,
        column.bundledFrameworkTfm, column.channel, column.isRuntimeCustomBuild, column.isAspnetCoreCustomBuild,
        column.runtimePR, column.aspnetCorePR,
    ]);
}

export function orderObservations(a: FocusObservation, b: FocusObservation): number {
    return a.day.localeCompare(b.day)
        || a.sdkVersion.localeCompare(b.sdkVersion, 'en', { numeric: true })
        || a.id.localeCompare(b.id);
}

export function rollingWindows(values: readonly (number | null)[], observations: readonly FocusObservation[], size = FOCUS_WINDOW_SIZE): (FocusWindow | null)[] {
    if (!Number.isInteger(size) || size < 1) throw new RangeError('Window size must be a positive integer.');
    if (values.length !== observations.length) throw new RangeError('Every value needs an observation.');
    let window: number[] = [];
    return values.map((value, index) => {
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

export function buildFocusReport(publication: FocusPublication, app: string, range: FocusRange, now = new Date(), selection: FocusSelection = DEFAULT_FOCUS_SELECTION): FocusReport {
    const flavor = resolveFocusSelection(selection);
    if (!publication.index.apps.includes(app)) throw new FocusPublicationError(`Application '${app}' is not in the published index.`);
    const { startDay, endDay } = historyBounds(range, now);
    const buckets = new Map(publication.buckets.map(bucket => [bucket.path, bucket]));
    const observations: FocusObservation[] = [];
    const seen = new Set<string>();
    let excludedCustomBuilds = 0;
    for (const bucket of publication.buckets) {
        bucket.header.columns.forEach((column, columnIndex) => {
            if (!isSdk12(column)) return;
            if (!isEligible(column)) {
                excludedCustomBuilds++;
                return;
            }
            const id = variantKey(column);
            if (seen.has(id)) throw new FocusPublicationError(`Duplicate SDK/variant identity in ${bucket.path}: ${column.sdkVersion}. Retry the publication.`);
            seen.add(id);
            observations.push({ id, sdkVersion: column.sdkVersion, day: column.releaseDate, bucket: bucket.path, columnIndex, variant: column });
        });
    }
    observations.sort(orderObservations);

    const metrics: FocusMetricReport[] = focusMetrics(app).map(definition => {
        const profile = definition.id === 'startup' ? selection.startupProfile : 'desktop';
        const rowKeys = focusRowKeys(flavor, profile);
        let advertised = false;
        let hasCohortRows = false;
        const allPoints: FocusPoint[] = observations.map(observation => {
            const bucket = buckets.get(observation.bucket)!;
            const available = definition.key !== null && (bucket.header.apps[app] ?? []).includes(definition.key);
            const rows = available && definition.key ? bucket.metrics[definition.key] : undefined;
            if (available && !rows) throw new FocusPublicationError(`Advertised ${app}/${definition.key} was not loaded from ${bucket.path}.`);
            advertised ||= available;
            hasCohortRows ||= !!rows && (rowKeys.mono in rows || rowKeys.coreclr in rows);
            const mono = rows?.[rowKeys.mono]?.[observation.columnIndex] ?? null;
            const coreclr = rows?.[rowKeys.coreclr]?.[observation.columnIndex] ?? null;
            const percent = percentVsMono(coreclr, mono);
            return { observation, position: 0, mono, coreclr, percent, issue: pairIssue(coreclr, mono, percent),
                monoWindow: null, coreclrWindow: null, percentWindow: null };
        });
        // Compute before date cropping: the first visible point keeps its preceding four observations.
        const monoWindows = rollingWindows(allPoints.map(p => isPositive(p.mono) ? p.mono : null), observations);
        const coreclrWindows = rollingWindows(allPoints.map(p => isPositive(p.coreclr) ? p.coreclr : null), observations);
        const percentWindows = rollingWindows(allPoints.map(p => p.percent), observations);
        allPoints.forEach((point, i) => {
            point.monoWindow = monoWindows[i];
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
            message = app === 'uno-gallery'
                ? 'Uno has no CoreCLR comparison in this flavor. Native-relink Mono data is not substituted.'
                : `No ${flavor.label} ${profile}/Chromium measurements. Another flavor or profile is not substituted.`;
        } else if (points.length === 0) {
            status = 'no-history';
            message = 'No eligible SDK 12 builds in this date range. Older results are not carried forward.';
        } else if (!latest) {
            status = points.some(point => (point.mono !== null && !isPositive(point.mono))
                || (point.coreclr !== null && !isPositive(point.coreclr))) ? 'invalid-value' : 'incomplete-pair';
            message = status === 'invalid-value'
                ? 'Comparison unavailable: both runtime values must be finite and positive; the Mono baseline cannot be zero.'
                : `No complete ${flavor.coreclrLabel} / ${flavor.monoLabel} ${profile} pair in this range. Missing selected preset/profile rows are not substituted.`;
        }
        return {
            ...definition, profile, coreclrPreset: flavor.coreclrPreset, monoPreset: flavor.monoPreset,
            coreclrLabel: flavor.coreclrLabel, monoLabel: flavor.monoLabel,
            coreclrRowKey: rowKeys.coreclr, monoRowKey: rowKeys.mono,
            description: `${definition.description} ${flavor.coreclrLabel} vs ${flavor.monoLabel}; ${profile}/Chromium. ${
                profile === 'mobile' ? 'Mobile emulation: 3x CPU slowdown, 20 Mbps download, 5 Mbps upload, 70 ms latency.'
                    : 'Desktop: no CPU or network throttling.'}`,
            status, message, points, latest, pairCount: pairs.length,
            comparison: latest?.percent !== null && latest?.percent !== undefined ? comparisonLabel(latest.percent, definition.unit) : null,
            averageComparison: latest?.percentWindow ? comparisonLabel(latest.percentWindow.mean, definition.unit) : null,
            hasNewerIncomplete: latest !== null && latest.position < points.length - 1,
            ageDays: latest ? Math.round((Date.parse(endDay) - Date.parse(latest.observation.day)) / 86_400_000) : null,
        };
    });
    const knownObservations = observations.filter(observation => observation.day <= endDay);
    return {
        app, apps: publication.index.apps, flavor: selection.flavor, flavorLabel: flavor.label, startupProfile: selection.startupProfile,
        range, startDay, endDay, lastUpdated: publication.index.lastUpdated,
        targetFrameworks: [...new Set(knownObservations.map(o => o.variant.bundledFrameworkTfm ?? 'Unknown'))].sort(),
        availableStartDay: knownObservations[0]?.day ?? null,
        availableEndDay: knownObservations.at(-1)?.day ?? null,
        excludedCustomBuilds, metrics,
    };
}
