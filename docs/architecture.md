# Architecture

## Overview

The benchmark suite is a TypeScript CLI (`bench/`) that orchestrates building .NET WASM sample apps (`src/`), measuring their performance in browsers and CLI engines, and publishing results to a Blazor dashboard on GitHub Pages (`gh-pages/`).

## Repository layout

```
bench/              TypeScript CLI — pipeline orchestration and measurement
  src/
    stages/         One file per pipeline stage
    lib/            Shared utilities (metrics, HTTP, walkthroughs, stats)
    main.ts         Entry point
    args.ts         CLI argument parsing
    enums.ts        All dimension enums (App, Preset, Engine, Profile, Stage, MetricKey)
    context.ts      BenchContext — shared state across stages
src/                .NET sample apps and MSBuild configuration
  presets.props     Build preset definitions (MSBuild properties)
  versions.props    SDK version detection and package versions
  Directory.Build.* Output path layout and runtime pack override
gh-pages/           Dashboard (Blazor WASM) + published app snapshots + result views
  data/views/       Weekly and release view JSON consumed by the dashboard
  apps/             Latest published app bundles (deployed by build stage)
docker/             Container images for CI
  Dockerfile        Three-stage: base → browser-bench-build → browser-bench-measure
  entrypoint.sh     Symlinks pre-installed node_modules into workspace
tracking/           Cache branch for SDK enumeration state and lock files
artifacts/          Local build outputs, downloaded SDKs, and result JSON
```

## Dashboard views

The Blazor viewer has Home, NET12 focus, NET12 dev-loop and delta routes, using the
app-relative `data/views/` root. Home and Focus share left-pane navigation;
delta reports remain linked from point details. Focus owns separate charts and
pure comparison/window logic, without changing the benchmark producer.
See [dashboard.md](dashboard.md) for selectors, provenance limits, local data
sources and tests of the source-built viewer.

## Pipeline stages

The CLI executes stages in the order specified by `--stages`:

### Data enumeration
| Stage | Purpose |
|-------|---------|
| `check-out-tracking` | Clone/sync the `tracking` branch; seed artifact cache |
| `enumerate-daily-packs` | Query NuGet feed for nightly SDK versions → `daily-packs-list.json` |
| `enumerate-release-packs` | Query official releases and feature bands → `release-packs-list.json` |
| `update-cache` | Merge fresh lists into tracking branch, push |

### SDK resolution and acquisition
| Stage | Purpose |
|-------|---------|
| `resolve-sdk` | Pick SDK (latest, by version, or by commit); fetch runtime/SDK git SHAs from VMR `source-manifest.json` |
| `download-sdk` | Run `dotnet-install.ps1`/`.sh`; optionally restore runtime pack from NuGet |

### Compilation
| Stage | Purpose |
|-------|---------|
| `build` | `dotnet publish` each (app × preset × runtime) combination; record compile time and file integrity |
| `deploy-latest-app` | If SDK is latest daily: copy wwwroot to `gh-pages/apps/{app}/` |

### Measurement
| Stage | Purpose |
|-------|---------|
| `measure` | For each (app × preset × engine × profile): start HTTP server, launch browser/CLI, collect all metrics, write result JSON |
| `measure-dev-loop` | Live clean-Debug build/run/edit/render measurements with isolated source copies and paired runtimes |
| `transform-debug-views` | Local, provenance-preserving clean-Debug static views without tracking or Git updates |
| `publish-debug-views` | Explicit Debug publication; recompute the merge against the latest gh-pages state on every retry |
| `transform-views` | Load result JSON, generate weekly/release view grids for the dashboard |
| `update-views` | Commit views to gh-pages branch, push |

### Auxiliary
| Stage | Purpose |
|-------|---------|
| `docker-image` | Build and push CI container images to GHCR |
| `schedule` | Mark completed SDKs as `.done`, dispatch benchmarks for untested packs |
| `enumerate-commits` | List dotnet/runtime commits (reserved) |

## Developer-loop pipeline

`measure-dev-loop` owns source snapshots and live build/run/watch processes on
the same host as Chromium. It uses an installed SDK without publishing,
tracking or cache updates. Publish and live commands share
`bench/src/lib/build-settings.ts`; only their measurement lifecycles differ.
The existing `dev-loop` preset sets `Configuration=Debug`. Shared SDK targeting
compatibility remains in `versions.props`, separate from feature settings.

Tagged batches retain every attempt, source/configuration provenance and
render/update evidence. `transform-debug-views` writes immutable generations
under `data/views/debug/`, separate from scalar publish grids.
`publish-debug-views` requires a clean dedicated `gh-pages` checkout and uses
`commitAndPushWithRetry`: each retry pulls and recomputes the batch union.
The manual workflow pairs runtimes on one runner; publication is opt-in.

The `/net12-debug` page owns a separate loader/session and typed C#/TS reports,
sharing navigation and the chart renderer, not publish cohorts or timing rules.
See [metrics](metrics.md#clean-debug-developer-loop) and [dashboard](dashboard.md).

### Shared app startup

Blazor entrypoints use `src/runtime-ready.mjs`: the dedicated builder callback
when available, otherwise an explicitly reported older-SDK callback. MSBuild
stages it into each app's generated `wwwroot` before static-asset discovery.
Havit registers imports only after the runtime API is available.

## BenchContext

All stages share a `BenchContext` object (defined in `bench/src/context.ts`) that carries:
- Pipeline configuration (stages, filters, flags)
- SDK info (version, git hashes, commit metadata)
- Build manifest (compile times, publish directories)
- Resolved paths (artifacts, SDK, results)
- Environment info (platform, CI detection)

In CI, context is serialized to `bench-context.json` for cross-job handoff.

## Container architecture

The Dockerfile defines three stages:

| Image | Base | Adds |
|-------|------|------|
| `base` | Ubuntu 24.04 | Node.js 24, tsx, curl, git |
| `browser-bench-build` | base | .NET SDK native deps (libicu, libssl, zlib), pre-installed npm deps |
| `browser-bench-measure` | base | Playwright browsers, V8 d8, non-root `benchuser` (required for Firefox) |

The entrypoint script symlinks pre-installed `node_modules` from `/opt/bench-deps/` into the workspace to handle volume-mounted repos where ESM `import()` can't use `NODE_PATH`.

## CI workflows

| Workflow | Trigger | Pipeline |
|----------|---------|----------|
| `benchmark.yml` | Daily 04:00 UTC, PR, manual | resolve → build → measure (matrix: app × preset) → aggregate → schedule |
| `docker-build.yml` | Weekly, push to `docker/`/`bench/`, manual | Build and push container images to GHCR |
| `schedule.yml` | Manual | Enumerate packs → dispatch benchmarks for untested SDK versions |
| `debug-benchmark.yml` | Manual | Paired dev-loop measurement → artifacts → optional publication |

### benchmark.yml job flow

1. **resolve** — enumerate SDK packs, pick target SDK, upload `bench-context.json`
2. **build** — download SDK, build all apps, generate measurement matrix
3. **measure** — parallel jobs (one per app × preset), each collects all engines/profiles
4. **aggregate** — merge results into dashboard views, push to gh-pages
5. **schedule** — dispatch next untested SDK (if aggregate succeeded)
