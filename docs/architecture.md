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

## Pipeline stages

The CLI defines 14 stages, executed in the order specified by `--stages`:

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
| `transform-views` | Load result JSON, generate weekly/release view grids for the dashboard |
| `update-views` | Commit views to gh-pages branch, push |

### Auxiliary
| Stage | Purpose |
|-------|---------|
| `docker-image` | Build and push CI container images to GHCR |
| `schedule` | Mark completed SDKs as `.done`, dispatch benchmarks for untested packs |
| `enumerate-commits` | List dotnet/runtime commits (reserved) |

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

### benchmark.yml job flow

1. **resolve** — enumerate SDK packs, pick target SDK, upload `bench-context.json`
2. **build** — download SDK, build all apps, generate measurement matrix
3. **measure** — parallel jobs (one per app × preset), each collects all engines/profiles
4. **aggregate** — merge results into dashboard views, push to gh-pages
5. **schedule** — dispatch next untested SDK (if aggregate succeeded)
