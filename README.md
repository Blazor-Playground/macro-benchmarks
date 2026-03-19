# .NET Browser WASM Benchmark Suite

Daily performance tracking for .NET WebAssembly in browsers. Automatically builds sample apps against the latest nightly .NET SDK, measures load time, download size, and memory across engines and build configurations, then publishes the results to a [live dashboard](https://blazor-playground.github.io/macro-benchmarks/).

## Apps benchmarked

| App | Description |
|-----|-------------|
| **empty-browser** | Minimal .NET WASM console app — baseline for startup and size |
| **empty-blazor** | Bare Blazor WebAssembly app — framework overhead baseline |
| **blazing-pizza** | Real-world Blazor PWA with routing, local storage |
| **micro-benchmarks** | JS↔C# interop, JSON parsing, and exception-handling ops/sec |
| **havit-bootstrap** | Havit Blazor Bootstrap component library |
| **mud-blazor** | MUD Blazor Material Design component library |

## Pipeline stages

The benchmarking CLI (`bench.ps1` / `bench.sh`) orchestrates these stages:

1. **enumerate-daily-packs / enumerate-release-packs** — Query NuGet feeds for available SDK versions
2. **resolve-sdk** — Pick an SDK (latest, by version, or by commit) and fetch runtime/SDK commit SHAs
3. **download-sdk** — Install the .NET SDK via dotnet-install scripts
4. **build** — `dotnet publish` each (app × preset × runtime) combination
5. **measure** — Launch browsers (Chrome/Firefox via Playwright) or CLI engines (V8/Node), collect metrics
6. **transform-views** — Aggregate result JSON into weekly/release views for the dashboard
7. **update-views** — Commit views to the gh-pages branch

Default: `resolve-sdk,download-sdk,build,measure,transform-views`

## Build presets

| Preset | Config | Native | Description |
|--------|--------|:------:|-------------|
| dev-loop | Debug | — | Fast inner-loop; no trimming, no compression |
| no-workload | Release | — | Baseline release; trimmed, no native build |
| native-relink | Release | ✓ | Native WASM via Emscripten, no AOT |
| aot | Release | ✓ | Full Mono AOT — slow startup, fastest execution |
| invariant | Release | ✓ | Invariant globalization (no ICU data) |

## Metrics collected

- **Compile time** — wall-clock `dotnet publish` duration
- **Disk size** — native `.wasm` and managed `.dll` sizes
- **Download size** — compressed bytes over the wire (Chrome CDP)
- **Time to managed** — cold (first load) and warm (min of reloads) to `dotnet_managed_ready`
- **Memory peak** — max JS heap observed during load
- **Walkthrough timing** — interactive navigation scenarios (pizza, havit, mud)
- **Microbenchmark ops/sec** — JS interop, JSON parse, exception handling

## Running locally

Prerequisites: Node.js ≥ 24, .NET SDK (downloaded automatically).

```powershell
# Windows
.\bench.ps1 --verbose --stages enumerate-daily-packs,enumerate-release-packs,resolve-sdk,download-sdk,build,measure --preset dev-loop --app blazing-pizza --dry-run
```

```bash
# Linux / macOS
./bench.sh --verbose --stages resolve-sdk,download-sdk,build,measure --preset dev-loop --app blazing-pizza --dry-run
```

Use `--help` for all options.

## CI/CD

- **benchmark.yml** — Daily + manual: resolve → build → measure → deploy results ([recent runs](https://github.com/blazor-playground/macro-benchmarks/actions/workflows/benchmark.yml))
- **docker-build.yml** — Weekly: builds `browser-bench-build` and `browser-bench-measure` container images
- **schedule.yml** — Dispatches benchmarks for SDK channels

## Repository layout

```
bench/           TypeScript CLI — pipeline orchestration and measurement
src/             .NET sample apps and MSBuild configuration
docker/          Container images for CI (Ubuntu 24.04, Node 24, Playwright, V8)
artifacts/       Local build outputs, results, and downloaded SDKs
tracking/        Cache branch for SDK enumeration state
gh-pages/        Dashboard (Blazor WASM) + published app snapshots + result views
```

See [docs/](docs/) for detailed documentation.