# Metrics and Measurement

## Clean Debug developer loop

The [issue's Debug scenarios](https://github.com/dotnet/runtime/issues/133691)
use the existing configuration-only `dev-loop` preset. Empty Blazor and Havit
are supported on macOS/Linux with Chromium.

Stock-SDK builds of both apps use the matching private
`Microsoft.AspNetCore.Components.WebAssembly.DevServer` package for `dotnet run`
and `dotnet watch`. The evaluated host command is retained in each trial.

| Key | Timed boundary (raw milliseconds; lower is better) |
|---|---|
| `debug-first-run-to-first-render` | Spawn `dotnet run` through host receipt of the first real route-render acknowledgement |
| `debug-incremental-run-to-first-render` | Spawn fresh `dotnet run` after an edit is saved and the previous run is stopped, retaining previous build outputs, through updated first render |
| `debug-rebuild-edit-to-render` | Save controlled edit, stop, incremental `dotnet build`, `dotnet run --no-build`, navigate and render |
| `debug-incremental-build` | The incremental build subprocess's start through successful exit, validated by subsequent rendered output |
| `debug-hot-reload-edit-to-render` | Save a managed method-body edit through applied-delta and changed-render acknowledgement, without reload/restart |
| `havit-walkthrough` | Existing in-browser Havit navigation scenario on the clean-Debug development host; initial load excluded |

**Incremental run starts at the command; rebuild starts at the edit.**
Run excludes saving and previous shutdown. Rebuild includes shutdown and uses
a scripted build/restart, not automatic `dotnet watch` restart. Its build-only
duration is a breakdown, not another end-to-end scenario.

Dependencies are restored before timing; the normal `dotnet run` restore check
is included. The browser is prelaunched. First-run compilation outputs are clean;
incremental scenarios retain outputs and a warm browser cache at the same
loopback origin. Service workers are blocked. Desktop is unthrottled and no
managed debugger is attached. First render means the real initial route and
the probe's DOM commit plus two animation-frame callbacks, **not LCP or physical
display presentation**. Host and browser clocks are never subtracted.

Hot reload waits for watch's `Waiting for changes` readiness before editing;
watch startup is untimed. A method-body edit must advance the applied-delta
generation, change rendered output, preserve component state and retain
document/runtime/host identities. Navigation or replaced contexts reject the
sample. Runtime capability is probed; CoreCLR support is tracked in
[dotnet/runtime#134337](https://github.com/dotnet/runtime/issues/134337).
Failures, unsupported cases and timeouts remain outcomes, never zero timings or
reload substitutes.

Five predetermined trials alternate runtime order on one runner. Aggregation is
the median without outlier removal; every outcome is retained, with no automatic
retry. Fewer trials are smoke-only. Complete local pairs may show descriptive
comparisons labeled shared-host/non-CI; partial or unclassified local data may not.
Watcher mode and logging are recorded.

Raw `debug-dev-loop` records retain methodology `debug-sdk-defaults-v1`,
SDK/source/browser/runner provenance, evaluated settings, phase offsets and
per-attempt evidence. Missing hashes stay unknown. Local pairs record
`comparisonScope=local-paired` and `controlled=false`.

Edits occur only in isolated copies. Cancellation closes owned browser/app/watch
processes, restores source and persists the cancelled attempt; repeated signals
do not skip cleanup. Shared SDK build servers are never stopped.
See [pipeline/publication architecture](architecture.md#developer-loop-pipeline)
and [local commands](cli-reference.md#clean-debug).

## Metrics reference

### Build and size metrics

| Key | Unit | Description |
|-----|------|-------------|
| `compile-time` | ms | Wall-clock duration of `dotnet publish` |
| `disk-size-native` | bytes | Uncompressed `.wasm` files in `_framework/` |
| `disk-size-assemblies` | bytes | Managed `.dll` assemblies in `_framework/` |
| `download-size-cold` | bytes | Compressed bytes transferred over the wire (Chrome CDP `encodedDataLength`) |
| `download-size-warm` | bytes | Compressed bytes transferred over the wire (Chrome CDP `encodedDataLength`) |
| `server-requests-cold` | count | Number of HTTP requests which a hit the server |
| `server-requests-warm` | count | Number of HTTP requests which a hit the server |

### Timing metrics

| Key | Unit | Description |
|-----|------|-------------|
| `time-to-reach-managed-warm` | ms | Minimum across warm reloads to `dotnet_managed_ready` |
| `time-to-reach-managed-cold` | ms | First navigation (empty cache) to `dotnet_managed_ready` |
| `time-to-create-dotnet-warm` | ms | Warm reload to dotnet runtime creation |
| `time-to-create-dotnet-cold` | ms | Cold load to dotnet runtime creation |
| `time-to-exit-warm` | ms | Warm reload to app exit |
| `time-to-exit-cold` | ms | Cold load to app exit |

### Memory metrics

| Key | Unit | Description |
|-----|------|-------------|
| `memory-peak` | bytes | Maximum `JSHeapUsedSize` sampled every 100 ms during load |
| `wasm-memory-size` | bytes | WASM linear memory size at managed ready |

### Walkthrough metrics (Chrome/desktop only)

| Key | Unit | Description |
|-----|------|-------------|
| `pizza-walkthrough` | ms | Blazing Pizza navigation scenario |
| `havit-walkthrough` | ms | Havit Bootstrap interaction scenario |
| `mud-walkthrough` | ms | MUD Blazor interaction scenario |
| `uno-walkthrough` | ms | Uno Gallery navigation scenario |
| `semi-walkthrough` | ms | Semi Avalonia: select each demo page and wait until it is rendered |

### Avalonia scenario metrics (avalonia-bench, Chrome/desktop only)

Each scenario runs in the page (see `src/avalonia-bench/README.md`). The reported value is the
interquartile mean of 3 runs, and each run is the median of several samples.

| Key | Unit | Description |
|-----|------|-------------|
| `avalonia-virtualized-scroll-ops` | ops/sec | Scroll steps (with layout) over 10,000 virtualized items |
| `avalonia-control-templates-ops` | ops/sec | Themed, templated Buttons created, laid out and removed |
| `avalonia-text-layout-ops` | ops/sec | Wrapped `TextLayout`s of pseudo-random sentences (HarfBuzz shaping, line breaking) |
| `avalonia-skia-drawing-ops` | ops/sec | Paths, shapes, gradients and transforms drawn into a CPU `RenderTargetBitmap` |
| `avalonia-fps-layout-resize` | fps | ~1200 Borders resized every frame (full measure/arrange) |
| `avalonia-fps-render-transforms` | fps | ~1500 Borders with UI-thread keyframe animations (transform, opacity) |
| `avalonia-property-set-get-ops` | ops/sec | Styled, direct and style-priority property operations |
| `avalonia-property-inheritance-ops` | ops/sec | Inherited property changes at the root of ~2100 controls |
| `avalonia-styles-class-toggle-ops` | ops/sec | Class changes under ~160 global style rules |
| `avalonia-styles-attach-ops` | ops/sec | Controls attached (and styled) under ~160 global style rules |
| `avalonia-hit-test-ops` | ops/sec | `InputHitTest` over ~2000 overlapping Borders |
| `avalonia-dispatcher-post-ops` | ops/sec | Dispatcher jobs posted at mixed priorities and drained |

### Microbenchmark metrics (CLI engines)

| Key | Unit | Description |
|-----|------|-------------|
| `js-interop-ops` | ops/sec | JS→C# `[JSImport]`/`[JSExport]` call loop |
| `json-parse-ops` | ops/sec | JS passes JSON to C# for deserialization |
| `exception-ops` | ops/sec | C# throw/catch exception round-trip |

## How measurement works

### Browser engines (Chrome, Firefox via Playwright)

1. **Start HTTP server** with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers (required for `SharedArrayBuffer`)
2. **Launch browser** via Playwright, set up CDP session (Chrome only)
3. **Apply throttle profile** — desktop: none; mobile: 3× CPU slowdown, 20 Mbps / 5 Mbps, 70 ms latency
4. **Track network** — `Network.loadingFinished` events, sum `encodedDataLength` for download size
5. **Sample memory** — poll `Performance.getMetrics` `JSHeapUsedSize` every 100 ms, record maximum
6. **Cold load** — navigate to page, wait for `bench_complete` global variable
7. **Warm loads** — reload N times in same context, record minimum timing
8. **Walkthroughs** — (Chrome/desktop only) run app-specific interactive scenarios, take median
9. **Collect results** — extract timing markers from `globalThis`

### CLI engines (V8 d8, Node)

1. Find entry module (`main*.mjs` or `main*.js`) in published `wwwroot/`
2. Execute: `d8 --module {entry}` or `node {entry}`
3. Parse stdout for JSON containing timing fields
4. For microbenchmarks: extract `bench_samples` array, compute stats

### Timing marker: `dotnet_managed_ready`

Apps set `globalThis.dotnet_managed_ready = performance.now()` via `[JSImport]` interop when managed code has fully initialized. Blazor apps (empty-blazor, blazing-pizza, etc.) do **not** set this marker — measurement falls back to wall-clock timing.

## Throttle profiles

| Profile | CPU | Network |
|---------|-----|---------|
| desktop | No throttling | No throttling |
| mobile | 3× slowdown | 20 Mbps down, 5 Mbps up, 70 ms latency |

## Dashboard views

The `transform-views` stage aggregates result JSON into view grids consumed by the Blazor dashboard:

- **Weekly views** — columns are runtime git hashes (daily SDK builds), grouped by week
- **Release views** — columns are SDK versions, grouped by .NET major version
- **Grid structure** — rows are `{app}/{metric}/{runtime}/{preset}/{profile}/{engine}`, values are sparse

Views are written to `gh-pages/data/views/` and committed by the `update-views` stage.
