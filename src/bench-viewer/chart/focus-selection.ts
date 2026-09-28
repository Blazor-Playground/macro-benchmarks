import type {
    FocusBaselinePreset, FocusCohort, FocusFlavorOption, FocusGraphVisibility, FocusPreset, FocusProfile, FocusSelection,
} from './focus-types.js';

export const FOCUS_FLAVORS = [
    { id: 'release-release', label: 'publish vs publish', coreclrPreset: 'no-workload', monoPreset: 'no-workload',
        coreclrLabel: 'CoreCLR publish', monoLabel: 'Mono publish' },
    { id: 'r2r-release', label: 'publish/R2R vs publish', coreclrPreset: 'aot', monoPreset: 'no-workload',
        coreclrLabel: 'CoreCLR publish/R2R', monoLabel: 'Mono publish' },
    { id: 'r2r-aot', label: 'publish/R2R vs publish/AOT', coreclrPreset: 'aot', monoPreset: 'aot',
        coreclrLabel: 'CoreCLR publish/R2R', monoLabel: 'Mono publish/AOT' },
] as const satisfies readonly FocusFlavorOption[];

// Razor initialization reads these defaults through focusConfiguration().
export const DEFAULT_FOCUS_SELECTION: Readonly<FocusSelection> = {
    flavor: 'r2r-release',
    startupProfile: 'mobile',
};

export const DEFAULT_FOCUS_GRAPH_VISIBILITY: Readonly<FocusGraphVisibility> = {
    percentage: false,
    measurements: true,
};

export const DEFAULT_FOCUS_AVERAGED = false;

export function resolveFocusSelection(selection: FocusSelection): FocusFlavorOption {
    const flavor = FOCUS_FLAVORS.find(option => option.id === selection.flavor);
    if (!flavor) throw new RangeError(`Unsupported comparison flavor: ${selection.flavor}`);
    if (selection.startupProfile !== 'desktop' && selection.startupProfile !== 'mobile') {
        throw new RangeError(`Unsupported startup profile: ${selection.startupProfile}`);
    }
    return flavor;
}

export function resolveFocusCohort(flavor: FocusFlavorOption, appRowKeys: Iterable<string>): FocusCohort {
    const baselines = new Set<FocusBaselinePreset>();
    for (const key of appRowKeys) {
        const [runtime, preset] = key.split('/');
        if ((runtime === 'coreclr' || runtime === 'mono') && (preset === 'no-workload' || preset === 'native-relink')) {
            baselines.add(preset);
        }
    }
    // Row presence, even all-null or one-sided, fixes the baseline for the whole app.
    const baselinePreset = baselines.has('no-workload') ? 'no-workload' : baselines.has('native-relink') ? 'native-relink' : null;
    const usesBaseline = flavor.coreclrPreset === 'no-workload' || flavor.monoPreset === 'no-workload';
    const effectivePreset = (preset: FocusPreset): FocusPreset => preset === 'no-workload' ? baselinePreset ?? preset : preset;
    const coreclrPreset = effectivePreset(flavor.coreclrPreset);
    const monoPreset = effectivePreset(flavor.monoPreset);
    const label = (preset: FocusPreset, name: string) => preset === 'native-relink' ? `${name} (native-relink)` : name;
    return {
        baselinePreset, usesBaseline, coreclrPreset, monoPreset,
        coreclrLabel: label(coreclrPreset, flavor.coreclrLabel),
        monoLabel: label(monoPreset, flavor.monoLabel),
        baselineDescription: !usesBaseline
            ? 'This flavor uses the explicit aot presets for CoreCLR publish/R2R and Mono publish/AOT, not the app publish baseline.'
            : baselinePreset === 'native-relink'
                ? 'Publish uses native-relink for this app: no no-workload rows exist in its loaded SDK 12 Focus metrics. This app-wide choice never fills individual gaps or replaces R2R/AOT.'
                : baselinePreset === 'no-workload'
                    ? 'Publish uses no-workload for this app. Any no-workload row retains this baseline across metrics, runtimes, profiles and date ranges, including all-null rows. Gaps stay missing.'
                    : 'Publish baseline unavailable: neither no-workload nor native-relink rows exist in this app\'s loaded SDK 12 Focus metrics. Other presets are not substituted.',
    };
}

export function focusRowKeys(cohort: Pick<FocusCohort, 'coreclrPreset' | 'monoPreset'>, profile: FocusProfile) {
    return {
        coreclr: `coreclr/${cohort.coreclrPreset}/${profile}/chrome`,
        mono: `mono/${cohort.monoPreset}/${profile}/chrome`,
    };
}

export function focusConfiguration() {
    return {
        defaultFlavor: DEFAULT_FOCUS_SELECTION.flavor,
        defaultStartupProfile: DEFAULT_FOCUS_SELECTION.startupProfile,
        defaultGraphVisibility: DEFAULT_FOCUS_GRAPH_VISIBILITY,
        defaultAveraged: DEFAULT_FOCUS_AVERAGED,
        flavors: FOCUS_FLAVORS,
    };
}
