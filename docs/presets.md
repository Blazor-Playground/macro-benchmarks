# Build Presets

Build presets control how `dotnet publish` compiles each sample app. They are defined in `src/presets.props` and selected via the `--preset` CLI flag (mapped to MSBuild property `BenchmarkPreset`).

## Preset summary

| Preset | Config | Native | Trimmed | Description |
|--------|--------|:------:|:-------:|-------------|
| `dev-loop` | Debug | — | — | Fast inner-loop: debug symbols, full ICU, no compression |
| `no-workload` | Release | — | ✓ | Baseline release build without native WASM compilation |
| `native-relink` | Release | ✓ | ✓ | Native WASM via Emscripten, no AOT |
| `aot` | Release | ✓ | ✓ | Full Mono AOT compilation |
| `no-jiterp` | Release | ✓ | ✓ | Disables Jiterpreter (interpreter fallback) |
| `invariant` | Release | ✓ | ✓ | Invariant globalization, no diagnostics, full trimming |
| `no-reflection-emit` | Release | — | ✓ | No dynamic code generation (extends invariant) |
| `enable-fingerprinting` | Release | ✓ | ✓ | Asset fingerprinting for cache-busting (deployment only) |

## Constraints

- **Mono-only**: `aot`, `no-jiterp` — incompatible with CoreCLR runtime
- **Blazor-incompatible**: `no-reflection-emit` — requires dynamic code for component rendering
- **Deployment-only**: `enable-fingerprinting` — used for gh-pages app snapshots, skipped from measurement
- **No workload required**: `dev-loop`, `no-workload` — do not need `wasm-tools` workload
