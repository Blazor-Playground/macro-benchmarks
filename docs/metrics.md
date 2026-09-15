# Metrics and Measurement

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

### Avalonia scenario metrics (avalonia-bench, Chrome/desktop only)

Each scenario runs in the page (see `src/avalonia-bench/README.md`). The reported value is the
interquartile mean of 3 runs, and each run is the median of several samples.

| Key | Unit | Description |
|-----|------|-------------|
| `avalonia-layout-pass-ops` | ops/sec | Invalidate ~200 TextBlocks and run a layout pass |
| `avalonia-pointer-move` | ms | Dispatch 200 DOM `pointermove` events until the control receives the last one |
| `avalonia-fps-layout-resize` | fps | ~1200 Borders resized every frame (full measure/arrange) |
| `avalonia-fps-render-transforms` | fps | ~1500 Borders with UI-thread keyframe animations (transform, opacity) |
| `avalonia-fps-composition-animations` | fps | ~1500 Borders with compositor keyframe animations |
| `avalonia-fps-tree-churn` | fps | 80 of ~800 subtrees removed and recreated every frame |
| `avalonia-property-set-get-ops` | ops/sec | Styled, direct and style-priority property operations |
| `avalonia-property-inheritance-ops` | ops/sec | Inherited property changes at the root of ~2100 controls |
| `avalonia-styles-class-toggle-ops` | ops/sec | Class changes under ~160 global style rules |
| `avalonia-styles-attach-ops` | ops/sec | Controls attached (and styled) under ~160 global style rules |
| `avalonia-hit-test-ops` | ops/sec | `InputHitTest` over ~2000 overlapping Borders |
| `avalonia-dispatcher-post-ops` | ops/sec | Dispatcher jobs posted at mixed priorities and drained |
| `avalonia-dispatcher-invoke-async-ops` | ops/sec | Chained `await Dispatcher.InvokeAsync` round-trips |

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
