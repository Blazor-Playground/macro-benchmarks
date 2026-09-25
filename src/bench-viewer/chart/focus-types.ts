export type FocusRange = '14d' | '1m' | '3m' | '6m' | '12m';
export type FocusFlavor = 'release-release' | 'r2r-release' | 'r2r-aot';
export type FocusProfile = 'desktop' | 'mobile';
export type FocusPreset = 'no-workload' | 'aot';
export interface FocusGraphVisibility {
    percentage: boolean;
    measurements: boolean;
}
export interface FocusSelection {
    flavor: FocusFlavor;
    startupProfile: FocusProfile;
}
export interface FocusFlavorOption {
    id: FocusFlavor;
    label: string;
    coreclrPreset: FocusPreset;
    monoPreset: FocusPreset;
    coreclrLabel: string;
    monoLabel: string;
}
export type FocusSeries = 'coreclr' | 'mono' | 'percent';
export type FocusRows = Record<string, (number | null)[]>;

export interface FocusIndex {
    lastUpdated: string;
    apps: string[];
    weeks: string[];
    releases: string[];
}

export interface FocusColumn {
    sdkVersion: string;
    releaseDate: string;
    major: number;
    channel: string;
    sdkGitHash: string;
    vmrGitHash: string;
    runtimeGitHash: string;
    aspnetCoreGitHash: string;
    runtimePackVersion: string | null;
    aspnetCoreVersion: string | null;
    workloadVersion: string | null;
    bootstrapSdkVersion: string | null;
    bundledFrameworkTfm: string | null;
    runtimeCommitDateTime: string | null;
    isRuntimeCustomBuild: boolean | null;
    isAspnetCoreCustomBuild: boolean | null;
    runtimePR: string | null;
    aspnetCorePR: string | null;
}

export interface FocusHeader {
    columns: FocusColumn[];
    apps: Record<string, string[]>;
}

export interface FocusBucket {
    path: string;
    header: FocusHeader;
    metrics: Record<string, FocusRows>;
}

export interface FocusPublication {
    index: FocusIndex;
    buckets: FocusBucket[];
}

export interface FocusObservation {
    id: string;
    sdkVersion: string;
    day: string;
    bucket: string;
    columnIndex: number;
    variant: FocusColumn;
}

export interface FocusWindow {
    mean: number;
    min: number;
    max: number;
    count: number;
    firstSdk: string;
    lastSdk: string;
    firstDay: string;
    lastDay: string;
}

export interface FocusComparison {
    value: number;
    magnitude: string;
    verdict: string;
    tone: 'better' | 'worse' | 'neutral';
}

export interface FocusPoint {
    observation: FocusObservation;
    position: number;
    coreclr: number | null;
    mono: number | null;
    percent: number | null;
    issue: string | null;
    coreclrWindow: FocusWindow | null;
    monoWindow: FocusWindow | null;
    percentWindow: FocusWindow | null;
}

export interface FocusMetricDefinition {
    id: string;
    title: string;
    key: string | null;
    unit: 'ms' | 's' | 'MB';
    divisor: number;
    description: string;
}

export interface FocusMetricReport extends FocusMetricDefinition {
    profile: FocusProfile;
    coreclrPreset: FocusPreset;
    monoPreset: FocusPreset;
    coreclrLabel: string;
    monoLabel: string;
    coreclrRowKey: string;
    monoRowKey: string;
    status: 'ready' | 'unsupported-metric' | 'unsupported-cohort' | 'no-history' | 'incomplete-pair' | 'invalid-value';
    message: string;
    points: FocusPoint[];
    latest: FocusPoint | null;
    comparison: FocusComparison | null;
    averageComparison: FocusComparison | null;
    hasNewerIncomplete: boolean;
    pairCount: number;
    ageDays: number | null;
}

export interface FocusReport extends FocusSelection {
    flavorLabel: string;
    app: string;
    apps: string[];
    range: FocusRange;
    startDay: string;
    endDay: string;
    lastUpdated: string;
    targetFrameworks: string[];
    availableStartDay: string | null;
    availableEndDay: string | null;
    excludedCustomBuilds: number;
    metrics: FocusMetricReport[];
}

export class FocusPublicationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FocusPublicationError';
    }
}
