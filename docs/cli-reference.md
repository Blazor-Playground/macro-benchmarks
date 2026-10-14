# CLI Reference

## Usage

```powershell
# Windows
.\bench.ps1 [options]

# Linux / macOS
./bench.sh [options]
```

The wrapper scripts check for Node.js ≥ 24, install `bench/` npm dependencies if needed, then invoke `tsx bench/src/main.ts` with the given arguments.

For local runtime source builds, use the separate
[bootstrap/iterate workflow](local-runtime-measurements.md), not the SDK pipeline
options below. `compare-local-runtime.mjs --help` lists its advanced options,
including check-only prerequisites and saved-results display.

## Options

### Pipeline control

| Flag | Default | Description |
|------|---------|-------------|
| `--stages <list>` | `resolve-sdk,download-sdk,build,measure,transform-views` | Comma-separated stage names to execute |
| `--context <path>` | | Load/save BenchContext from JSON file (cross-container handoff) |
| `--dry-run` | `false` | Minimal run: empty-browser + dev-loop + chrome + desktop only |
| `--verbose` | `false` | Verbose logging |
| `--help` | | Show help |

### SDK and runtime

| Flag | Default | Description |
|------|---------|-------------|
| `--sdk-channel <ch>` | `11.0` | SDK channel (e.g. 11.0, 9.0) |
| `--sdk-version <ver>` | | Exact SDK version (overrides channel) |
| `--runtime <rt>` | `mono` | Runtime flavor: `mono`, `coreclr` |
| `--runtime-pack <ver>` | | Specific runtime pack version |
| `--runtime-commit <sha>` | | Specific dotnet/runtime commit hash |

### Filters

Comma-separated lists that restrict which combinations get built and measured.

| Flag | Valid values |
|------|-------------|
| `--app <list>` | empty-browser, empty-blazor, blazing-pizza, havit-bootstrap, mud-blazor, micro-benchmarks, uno-gallery, igniteui-light, blazor-perf, semi-avalonia, avalonia-bench |
| `--preset <list>` | dev-loop, no-workload, native-relink, aot, no-jiterp, invariant, no-reflection-emit |
| `--engine <list>` | chrome, firefox, v8, node |
| `--profile <list>` | desktop, mobile |

### Measurement

| Flag | Default | Description |
|------|---------|-------------|
| `--retries <n>` | `0` | Max retries on measurement timeout |
| `--timeout <ms>` | `300000` | Per-measurement timeout in milliseconds |
| `--warm-runs <n>` | `5` | Number of warm/cold reload iterations |
| `--no-headless` | `false` | Launch browsers in headed mode (for debugging) |

### Live developer-loop measurement

These options apply to `measure-dev-loop`, not a separate build flavor.

| Flag | Default | Description |
|------|---------|-------------|
| `--debug-dotnet <path>` | Context SDK or `dotnet` on PATH | Installed SDK executable |
| `--debug-runs <n>` | `5` | Fixed trials per runtime/scenario; fewer than five are smoke-only |
| `--debug-scenarios <list>` | All | `first-run,incremental-run,rebuild,hot-reload,walkthrough` |
| `--debug-browser-channel <name>` | Bundled Chromium | Use `chrome` for installed Chrome |
| `--debug-views-dir <path>` | `artifacts/debug-views` | Local transformed-view destination |

### Docker

| Flag | Description |
|------|-------------|
| `--skip-docker-build` | Reuse existing Docker images |
| `--force-docker-build` | Rebuild images even if they exist |

### Scheduling

| Flag | Default | Description |
|------|---------|-------------|
| `--max-dispatches <n>` | `1` | Max workflow dispatches per schedule run |
| `--repo <owner/name>` | auto-detect | GitHub repository |
| `--branch <name>` | `main` | Branch for dispatch |

### Enumeration

| Flag | Default | Description |
|------|---------|-------------|
| `--major <n>` | `11` | .NET major version for daily enumeration |
| `--months <n>` | `3` | History months to scan |
| `--release-majors <list>` | `8,9,10` | Majors for release enumeration |
| `--force-enumerate` | `false` | Re-resolve all versions (ignore cache) |

### Consolidation

| Flag | Description |
|------|-------------|
| `--artifacts-dir <path>` | CI artifacts input directory for result aggregation |

## Examples

### Clean Debug

Use an installed SDK12, Node 24+, root and `bench/` dependencies, and Chromium or
Chrome. These stages restore app dependencies outside timing, without SDK/workload
installation, publishing or tracking/cache/Git updates.

```bash
export PATH="/opt/homebrew/bin:$PATH"
bench/node_modules/.bin/tsx bench/src/main.ts \
  --stages measure-dev-loop,transform-debug-views \
  --debug-dotnet /absolute/path/to/dotnet \
  --app empty-blazor --preset dev-loop --runtime mono,coreclr \
  --debug-runs 1 --debug-browser-channel chrome
```

One trial is correctness smoke; use `--debug-runs 5` for a full batch.
Defaults are `dev-loop`, both supported apps, Mono/CoreCLR and desktop Chromium.
`--sdk-version` can enforce an exact installed version. Full local pairs remain
labeled shared-host/non-CI. Avoid overlapping benchmarks, builds or tests.

`--dry-run` and combinations with install, tracking, publish or legacy transform
stages are rejected. `--timeout` bounds waits. Cancellation retains trial evidence
and closes only owned processes.

Raw results are `artifacts/debug-results/debug-*.json`. To inspect failures,
transform the retained records separately:

```bash
export PATH="/opt/homebrew/bin:$PATH"
bench/node_modules/.bin/tsx bench/src/main.ts --stages transform-debug-views \
  --artifacts-dir artifacts/debug-results --debug-views-dir artifacts/debug-views
```

Publication is separate: `--stages publish-debug-views --artifacts-dir <raw-dir>`
requires a clean `gh-pages/` checkout tracking `origin/gh-pages` and changes only
`data/views/debug/`. Do not generate files in that checkout first.
`--dry-run` skips publication. Retries pull and recompute the batch union.

The manual **Clean Debug benchmark** workflow retains evidence on failure.
It defaults to one-trial smoke with publication off; opt-in publication requires
five trials. No collection schedule is added.

### Other pipeline examples

```powershell
# Full dry run — validates pipeline without building or measuring
.\bench.ps1 --dry-run

# Build and measure a single app with a specific preset
.\bench.ps1 --verbose --stages resolve-sdk,download-sdk,build,measure --app blazing-pizza --preset dev-loop

# Enumerate available SDK packs
.\bench.ps1 --stages enumerate-daily-packs,enumerate-release-packs

# Measure against a specific SDK version
.\bench.ps1 --sdk-version 11.0.100-preview.3.26117.103 --stages resolve-sdk,download-sdk,build,measure

# Run with a specific runtime commit
.\bench.ps1 --runtime-commit abc123def456 --stages resolve-sdk,download-sdk,build,measure

# Build only (no measurement)
.\bench.ps1 --stages resolve-sdk,download-sdk,build

# Transform and deploy results
.\bench.ps1 --stages transform-views,update-views
```
