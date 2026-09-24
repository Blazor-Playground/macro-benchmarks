import type { FocusFlavorOption, FocusGraphVisibility, FocusProfile, FocusSelection } from './focus-types.js';

export const FOCUS_FLAVORS = [
    { id: 'release-release', label: 'Release vs Release', coreclrPreset: 'no-workload', monoPreset: 'no-workload',
        coreclrLabel: 'CoreCLR Release', monoLabel: 'Mono Release' },
    { id: 'r2r-release', label: 'Release/R2R vs Release', coreclrPreset: 'aot', monoPreset: 'no-workload',
        coreclrLabel: 'CoreCLR R2R', monoLabel: 'Mono Release' },
    { id: 'r2r-aot', label: 'Release/R2R vs Release/AOT', coreclrPreset: 'aot', monoPreset: 'aot',
        coreclrLabel: 'CoreCLR R2R', monoLabel: 'Mono AOT' },
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

export function focusRowKeys(flavor: FocusFlavorOption, profile: FocusProfile) {
    return {
        coreclr: `coreclr/${flavor.coreclrPreset}/${profile}/chrome`,
        mono: `mono/${flavor.monoPreset}/${profile}/chrome`,
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
