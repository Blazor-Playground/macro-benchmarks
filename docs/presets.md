# Build Presets

Build presets are defined in `src/presets.props` and selected via the `--preset` CLI flag (mapped to MSBuild property `BenchmarkPreset`). The existing `dev-loop` flavor is used by both ordinary build/publish and live `measure-dev-loop` measurements; there is no separate `debug` flavor.

## Preset summary

| Preset | Config | Native | Trimmed | Description |
|--------|--------|:------:|:-------:|-------------|
| `dev-loop` | Debug | SDK default | SDK default | Clean Debug; sets only Configuration=Debug |
| `no-workload` | Release | — | ✓ | Baseline release build without native WASM compilation |
| `native-relink` | Release | ✓ | ✓ | Native WASM via Emscripten, no AOT |
| `aot` | Release | Mono only* | ✓ | Full Mono AOT or full non-composite CoreCLR R2R |
| `r2r-pgo` | Release | No* | ✓ | CoreCLR profile-guided partial non-composite R2R |
| `r2r-composite` | Release | No* | ✓ | CoreCLR full composite R2R |
| `r2r-composite-pgo` | Release | No* | ✓ | CoreCLR profile-guided partial composite R2R |
| `no-jiterp` | Release | ✓ | ✓ | Disables Jiterpreter (interpreter fallback) |
| `invariant` | Release | ✓ | ✓ | Invariant globalization, no diagnostics, full trimming |
| `no-reflection-emit` | Release | — | ✓ | No dynamic code generation (extends invariant) |

## Constraints

- **Mono-only**: `no-jiterp`.
- **CoreCLR-only**: `r2r-pgo`, `r2r-composite`, `r2r-composite-pgo`.
- **Blazor-incompatible**: `no-reflection-emit` — requires dynamic code for component rendering
- **No workload required**: `no-workload` explicitly avoids native WASM compilation; `dev-loop` follows SDK/app Debug defaults and is built before optional workload installation in the existing pipeline.

*CoreCLR R2R does not require native relinking or wasm-tools except for apps with
native components. Existing app compatibility exclusions still apply.

## Profile-guided R2R

The regular CI/daily matrix includes the three additional CoreCLR presets above.
The existing `aot` preset remains the full, non-composite control; historical
results are not relabeled. Local runtime iteration/history workflows are unchanged.

Both PGO presets restore `optimization.browser-wasm.MIBC.Runtime` version
`1.0.0-prerelease.26502.1` from the public `dotnet11-transport` feed configured in
`NuGet.config`. The version is pinned in `src/versions.props`; update it deliberately.
The package's `data/DotNet_Blazor_Wasm.mibc` is passed through the standard
`PublishReadyToRunPgoFiles` item. Browser targets add `--partial`: methods selected
by the profile are precompiled, while other methods remain interpreted.
The same profile is used for Blazor and non-Blazor apps; its coverage and benefit
can differ by app. Exact assembly versions need not match; unresolved records
are ignored and stale profiles can reduce coverage.

Before building the new variants, the pipeline restores a full-R2R probe and
inspects its imported WebAssembly targets for PGO/composite support. Unsupported
variants are skipped with an explicit reason, including for source-built packs.
Missing packages, invalid profiles, and publish errors remain failures rather
than falling back to full R2R. PGO publishing also checks that partial compilation
is actually enabled.

Each preset has separate intermediate/publish paths and result series. Build
manifests and raw measurement metadata record `readyToRun` compilation mode,
composite mode, and (for PGO) package ID, version, profile filename and SHA-256.

For example:

```powershell
.\bench.ps1 --runtime coreclr --app empty-blazor --preset aot,r2r-pgo,r2r-composite,r2r-composite-pgo
```

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
