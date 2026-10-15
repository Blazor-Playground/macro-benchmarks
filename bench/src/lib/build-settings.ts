import { PRESET_CONFIG, PRESET_MAP, Preset, Runtime } from '../enums.js';

/** Select configuration and runtime; feature switches remain in presets.props. */
export function buildSettings(preset: Preset, runtime: Runtime): Record<string, string> {
    return {
        BenchmarkPreset: PRESET_MAP[preset],
        Configuration: PRESET_CONFIG[preset],
        ...(runtime === Runtime.NativeAOTLLVM
            ? { UsingNativeAOT: 'true' }
            : { RuntimeFlavor: runtime === Runtime.CoreCLR ? 'CoreCLR' : 'Mono' }),
    };
}

export function msbuildArgs(properties: Readonly<Record<string, string>>): string[] {
    return Object.entries(properties).map(([name, value]) => `-p:${name}=${value}`);
}

export function buildExecutionArgs(preset: Preset, publish = false): string[] {
    if (preset === Preset.DevLoop) return [];
    return [
        '-p:MSBuildDisableTaskHost=true',
        ...(publish ? ['-p:DisableParallelEmccCompile=true', '-p:DisableParallelAot=true'] : []),
        '-m:1',
    ];
}

export const DEV_LOOP_REVISION = 'sdk-debug-defaults-v1';
