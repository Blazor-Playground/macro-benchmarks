# Build Presets

Build presets are defined in `src/presets.props` and selected via the `--preset` CLI flag (mapped to MSBuild property `BenchmarkPreset`). The existing `dev-loop` flavor is used by both ordinary build/publish and live `measure-dev-loop` measurements; there is no separate `debug` flavor.

## Preset summary

| Preset | Config | Native | Trimmed | Description |
|--------|--------|:------:|:-------:|-------------|
| `dev-loop` | Debug | SDK default | SDK default | Clean Debug; sets only Configuration=Debug |
| `no-workload` | Release | — | ✓ | Baseline release build without native WASM compilation |
| `native-relink` | Release | ✓ | ✓ | Native WASM via Emscripten, no AOT |
| `aot` | Release | ✓ | ✓ | Full Mono AOT compilation |
| `no-jiterp` | Release | ✓ | ✓ | Disables Jiterpreter (interpreter fallback) |
| `invariant` | Release | ✓ | ✓ | Invariant globalization, no diagnostics, full trimming |
| `no-reflection-emit` | Release | — | ✓ | No dynamic code generation (extends invariant) |

## Constraints

- **Mono-only**: `aot`, `no-jiterp` — incompatible with CoreCLR runtime
- **Blazor-incompatible**: `no-reflection-emit` — requires dynamic code for component rendering
- **No workload required**: `no-workload` explicitly avoids native WASM compilation; `dev-loop` follows SDK/app Debug defaults and is built before optional workload installation in the existing pipeline.

## Clean Debug

The existing `dev-loop` / `BenchmarkPreset=DevLoop` preset now sets only
`Configuration=Debug` for publish and live measurements. This replaces the older
tuned DevLoop behavior, without adding a flavor. Trimming, native compilation,
compression, WebCIL, ICU, diagnostics, workloads and build parallelism follow SDK
defaults. Shared runtime selection, app dependencies and output paths remain.
Check workload requirements for the selected SDK/app.

The **SDK12 targeting compatibility bridge remains enabled**. For SDKs advertising
`net11.0` while bundling `net12.0` packages, `versions.props` selects the matching
TFM, maximum framework version and current target set for every preset.
Raw properties retain `_SdkTfm`, `_UseNet12TargetFrameworkWorkaround`,
`TargetFramework`, `NETCoreAppMaximumVersion` and `TargetsCurrent`. This is
package/TFM compatibility, not a Debug feature override.

Historical `dev-loop` rows retain the configuration under which they were
measured; their shared name does not retroactively make them clean Debug.
New publish manifests/raw results carry `presetRevision=sdk-debug-defaults-v1`.
Disk-size collection follows compressed assets actually emitted by the SDK
instead of assuming DevLoop is always uncompressed.
Live metrics require tagged clean-Debug methodology and recorded settings, never
old tuned publish/reload values. Earlier clean-Debug prototype batches named
`debug` remain readable only for compatibility; new records use `dev-loop`.
