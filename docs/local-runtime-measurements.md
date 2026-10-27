# Measure Havit with a local runtime

Run benchmark commands from macro-benchmarks and runtime builds from your
[dotnet/runtime](https://github.com/dotnet/runtime) checkout.
No SDK or ASP.NET source checkout is required.

## Quick start

```bash
node bench/bootstrap.mjs <path-to-local-runtime-build>
# Edit that runtime checkout, then:
node bench/iterate.mjs
```

Use the **runtime checkout root**, not `artifacts/` or Shipping.
Bootstrap builds clean Mono interpreter and CoreCLR composite controls at the
merge base, then CoreCLR composite from your checkout, including edits.
Allow time and disk space for three builds.

Omit the path to clone runtime into `artifacts/local-runtime-comparisons/`
(`artifacts/c/` on Windows).

Defaults: Release, Chrome desktop/mobile, 10 cold loads and 5 warm reloads per
profile, and one desktop walkthrough. Installed Chrome is preferred; otherwise
Playwright Chromium is used. Checkout, browser and forwarded options are saved
in `artifacts/local-runtime/quick-start.json`.

```bash
node bench/iterate.mjs --variant r2r       # Non-composite R2R on both sides
node bench/iterate.mjs --variant composite # Return to composite
node bench/iterate.mjs -- --cold-runs 3 --warm-runs 2
```

Options are remembered. `aot` is an alias for non-composite CoreCLR R2R.
Old interpreter-only settings require another bootstrap.

### Add daily before measurements

Add clean-main controls to the **current dashboard experiment**:

```bash
node bench/runtime-bench.mjs history add --from 2026-10-12 --to today
node bench/runtime-bench.mjs history add --from 2026-10-20
node bench/runtime-bench.mjs history add --fetch

node bench/runtime-bench.mjs history add --from 2026-10-12 --to today --dry-run
```

Ranges are inclusive UTC; a lone `--from` selects one day. Without dates, `add`
fills days after the latest complete before through today. To fill older gaps,
specify a range. Missing/failed dates run newest first; passed dates are kept.
A complete range is a no-op. After and matched controls are not remeasured.

Settings come from the current comparison, not `quick-start.json`.
Two owned clones reuse control builds without switching the after checkout.

`--fetch` refreshes runtime `origin/main` without switching HEAD. Otherwise the
local ref is used. Selection pins it once, choosing first-parent snapshots at UTC
day end; today stops at invocation time. Deepen shallow history if needed.
Same-commit dates may share cached evidence, not independent samples.

`--dry-run` does not fetch, build or change results. `--output <directory>` selects
the cache location; otherwise the comparison's output is used when recognizable,
or the platform default.
Unset `WasmReadyToRunProfile` and `PublishReadyToRunCrossgen2ExtraArgs` before collecting clean controls.
Failed dates retain logs and successful independent controls for retry.

### Drop dates from active local history

```bash
node bench/runtime-bench.mjs history drop --from 2026-10-20 --dry-run
node bench/runtime-bench.mjs history drop --from 2026-10-20
node bench/runtime-bench.mjs history drop --from 2026-10-17 --to 2026-10-19
node bench/runtime-bench.mjs history drop --all
```

Drop selects a **new comparison** without the requested history dates. After,
matched controls, other dates, raw files, caches and the previous comparison
remain. Nothing is deleted from disk. Only retained evidence must validate, so
drop can remove a date with damaged/missing files.

Re-adding can reuse valid caches; drop does not force remeasurement. `--all`
returns the default view to the matched pair. No matching dates is a no-op.
Use **Reload local data** in the dashboard after an edit.

### Older recent-days shortcut

This shortcut uses the remembered bootstrap setup, not the current comparison:

```bash
node bench/bootstrap.mjs --measure-recent-days=7
```

It covers today plus N-1 prior UTC days and revisits passed dates using caches.
`--force-before` remeasures them; failed retries keep valid saved pairs and warn.
This shortcut does not fetch. Adding it to a first bootstrap with a runtime path
also measures after.

## Prerequisites

Install Node.js 24+, Git, ZIP-capable tar, and the runtime's
[native prerequisites](https://github.com/dotnet/runtime/blob/main/docs/workflow/README.md).
See the [CoreCLR browser build guide](https://github.com/dotnet/runtime/blob/main/docs/workflow/building/coreclr/wasm.md)
and [Mono browser guide](https://github.com/dotnet/runtime/blob/main/src/mono/browser/README.md)
for revision-specific requirements.

```bash
npm ci
npm ci --prefix bench
# Only if installed Chrome is unavailable:
npx playwright install chromium
```

On Windows, use a **Visual Studio Developer Command Prompt** with the Desktop
development with C++ workload:

```cmd
node bench\bootstrap.mjs C:\src\runtime
node bench\iterate.mjs
```

Windows clones enable Git's `core.longpaths` locally. Also enable Win32 long paths per the
[runtime prerequisites](https://github.com/dotnet/runtime/blob/main/docs/workflow/requirements/windows-requirements.md#enable-long-paths).
MSVC still limits some generated PDB paths; use `--output <short-directory>`
([known issue](https://github.com/dotnet/runtime/issues/110407)).

Clear MinGW `CC`/`CXX` overrides (`set CC=` and `set CXX=`).
App restore/publish sets AnyCPU to avoid host-platform
[NETSDK1032](https://learn.microsoft.com/dotnet/core/tools/sdk-errors/netsdk1032).

Build commands check prerequisites and report missing tools without installing
them. To check only:

```bash
node bench/compare-local-runtime.mjs --check-prerequisites \
  --runtime-repo <path-to-local-runtime-build> -- --system-chrome
```

GNU tar cannot read `.nupkg` ZIP archives. On Debian/Ubuntu, install
`libarchive-tools`; on Fedora, install `bsdtar`. Quick start selects bsdtar when
needed. `BENCH_TAR=bsdtar` also selects it for the lower-level publisher.

## Source preservation and cache behavior

Before is `git merge-base HEAD refs/remotes/origin/main`, using the local tracking
ref. Only `history add --fetch` refreshes it.
The supplied checkout is **after only**: HEAD, index and source edits are
preserved. Builds still create generated outputs.

Control caches require matching source, mode, build settings, benchmark/dependency
inputs, SDK overrides, browser/Node versions and host. A valid cache skips the
control's build and measurement. Every iteration rebuilds and measures after.

Missing owned clones are recreated; modified or out-of-root clones are refused.
Missing evidence invalidates caches; corrupt records fail.
Do not run concurrent comparisons/history collections against the same output or
runtime checkout. After interruption, remove stale `.comparison-lock`/
`.history-lock` in that output, or `artifacts/local-runtime/.publication-lock`,
only after the owning process stops. Caches and pinned progress remain for retry.

Failed ref selection blocks iteration. Select the intended revision and bootstrap
that path, or use a new output. Build failures after selection can use `iterate`.

## Results

```bash
node bench/runtime-bench.mjs results
# Same-base view instead of historical controls:
node bench/runtime-bench.mjs results --view matched
# Select another saved comparison:
node bench/compare-local-runtime.mjs --display-results <comparison.json>
```

`artifacts/local-runtime/current-result.json` selects the comparison used by both
CLI and local viewer. Its raw-result references, passed statuses and hashes are
checked on load. `dashboard.json` is an offline export.

Bare `--display-results` uses the current result; `--output` selects the latest
**after measurement timestamp** within that explicit directory.
Reading results needs no builds, prerequisite checks or live Git. Broken current
evidence is an error, not a fallback to an older result.

With history, the summary uses the latest passed controls against fixed after;
`--view matched` uses the saved same-base pair. The UI and CLI show the same view,
date and comparison path.

The summary uses mobile cold startup and desktop walkthrough/download/publish.
Download uses decimal MB; publish time excludes restore and runtime builds.

**NET12 focus** compares after with Mono before; **CoreCLR change** compares after
with CoreCLR before. Without Mono, the first column uses after vs before.
Missing profiles/metrics remain unavailable.

Results record source state, mode, SDK/TFM, packages and samples. Retain your patch
to reproduce dirty sources. Status/color output supports `NO_COLOR`; colors show
direction, not statistical significance.

### Output locations

Generated outputs are ignored by Git. On Windows, the default is `artifacts/c/`
instead of `artifacts/local-runtime-comparisons/`. Existing experiments keep their
saved output unless `--output` changes it.

| Location | Contents |
|---|---|
| `artifacts/local-runtime-comparisons/before/` | Verified control cache records |
| `artifacts/local-runtime-comparisons/before-source/` | Owned source-clone pointers |
| `artifacts/local-runtime-comparisons/comparison-*/` | Build logs, `comparison.json`, portable `dashboard.json` |
| `artifacts/local-runtime-comparisons/before-build-*/` | Historical control build logs |
| `artifacts/local-runtime-comparisons/history/` | Pinned daily selections/progress and owned reusable historical sources |
| `artifacts/local-runtime/current-result.json` | Atomic pointer shared by CLI and local preview |
| `artifacts/local-runtime/<run>/` | Inputs, selected SDK/feed config, manifest, publish, logs and raw/aggregated results |

Havit intermediates use `artifacts/{obj,bin}/HavitBootstrap/<build-label>/`.
Keep files referenced by retained comparisons.

See [local charts](dashboard.md#local-runtime-comparisons) and
[metric definitions](metrics.md).

## Advanced drivers

`compare-local-runtime.mjs` builds, publishes and measures. CoreCLR defaults to
composite; Mono to interpreter. `--include-mono-before` adds the Mono control;
`--before-variant` allows a different before mode.

`--mono-before <manifest.json>` instead uses a measured pristine Mono source build
at the baseline commit. It takes precedence over automatic Mono measurement.
Setup/compatibility warnings identify controls that may not be matched.

Publishing defaults to `<runtime>/.dotnet`, honoring the checkout's `global.json`.
Use `--sdk <directory>` for a shared/compatible SDK or to hold all Havit publishes
to one SDK without changing runtime build SDKs. `--tfm` and `--aspnet-version`
apply to both sides. Different SDKs are warned; the runtime's bootstrap SDK is
not a complete from-source SDK/ASP.NET build.

`local-runtime.mjs` only publishes an **already-built** runtime. Its default is
interpreter:

```bash
node bench/local-runtime.mjs --runtime-repo <path-to-local-runtime-build> \
  --variant composite --measure -- --system-chrome --profile desktop,mobile
```

| Runtime | Variant | Publish mode |
|---|---|---|
| CoreCLR | `no-workload` | Interpreter |
| CoreCLR | `r2r` or `aot` | Non-composite R2R |
| CoreCLR | `composite` | Composite R2R, if supported by local bits |
| Mono | `no-workload` | Interpreter |
| Mono | `aot` | Native AOT/relink; Release build required |

After manual edits, rerun **build and packaging**. Each publish restores local
packages into a fresh cache with exclusive source mapping and SHA-512 checks.
Public dependencies use the official dotnet-public mirror and other configured
feeds; `--exclude-source <key>` omits a feed. Only per-run NuGet config is written.

To remeasure an existing publish without rebuilding:

```bash
node --import ./bench/node_modules/tsx/dist/loader.mjs \
  bench/src/scripts/measure-local-runtime.ts <manifest.json> \
  --system-chrome --profile desktop,mobile
```

Measurements check asset integrity, requested samples, startup and desktop Chrome
navigation. Mobile and Firefox collect startup only. Firefox requires its
Playwright browser. Each driver has `--help`.

## Manual runtime builds

Use separate CoreCLR/Mono checkouts. From the appropriate checkout:

```bash
# CoreCLR browser-WASM, including R2R tools:
./build.sh clr+libs+host -os browser -arch wasm -c Release /p:RuntimeFlavor=CoreCLR
./build.sh packs.product -os browser -arch wasm -c Release /p:RuntimeFlavor=CoreCLR
```

```bash
# Mono browser-WASM:
./build.sh mono+libs -os browser -arch wasm -c Release /p:RuntimeFlavor=Mono
# Optional: Mono AOT only.
./build.sh mono.aotcross -os browser -arch wasm -c Release /p:RuntimeFlavor=Mono
./build.sh packs.product -os browser -arch wasm -c Release /p:RuntimeFlavor=Mono
```

On Windows, use `build.cmd` with the same arguments.

Expected outputs:

```text
<runtime>/.dotnet/dotnet                          # dotnet.exe on Windows
<runtime>/artifacts/packages/Release/Shipping/    # runtime + WebAssembly .nupkg files
<runtime>/artifacts/bin/Crossgen2Tasks/Release/   # DLL, CrossGen props/targets
<runtime>/artifacts/bin/coreclr/browser.wasm.Release/<host-arch>/crossgen2/
```

Shipping contains `Microsoft.NETCore.App.Runtime.browser-wasm` (CoreCLR) or
`Microsoft.NETCore.App.Runtime.Mono.browser-wasm` (Mono), plus
`Microsoft.NET.Sdk.WebAssembly.Pack`.

Comparison drivers rebuild the WebAssembly SDK pack before uncached publishes;
CoreCLR's `packs.product` omits it. For manual publishing, use `Rebuild` to include
targets-only edits:

```bash
./.dotnet/dotnet msbuild src/mono/nuget/Microsoft.NET.Sdk.WebAssembly.Pack/Microsoft.NET.Sdk.WebAssembly.Pack.pkgproj \
  -t:Rebuild -p:Configuration=Release -p:TargetOS=browser \
  -p:TargetArchitecture=wasm -p:RuntimeFlavor=CoreCLR
```

Mono AOT also needs the WebAssembly native SDK, MonoAOTCompiler/MonoTargets task
packages, `mono-aot-cross[.exe]` and provisioned Emscripten. Their versions must
match the WebAssembly pack. Use `--emsdk` for a nonstandard tool-cache location.
Mono AOT execution remains unverified by the local validation.

## Pack selection and troubleshooting

- Late `KnownFrameworkReference`/`KnownWebAssemblySdkPack` **Update** items select
  local browser bits without redirecting ILLink, ASP.NET or known Crossgen2 packs.
  Do not replace this with blanket `RuntimeFrameworkVersion`. Mono metadata
  conditions belong inside a target; top-level unqualified metadata can cause MSB4191.
- `Crossgen2SdkOverridePropsPath`/`Crossgen2SdkOverrideTargetsPath` select local
  **task files**. `Crossgen2InBuildDir` selects the **compiler directory**; it does
  not replace those imports. `--use-sdk-crossgen2` is a warned mixed-bits fallback.
- Use `/p:RuntimeFlavor=CoreCLR`: the tested shell convenience option changed the
  case to `Coreclr`, omitting `libBrowserHost.js`.
- For NETSDK1045 or missing ASP.NET WASM namespaces, inspect the SDK's supported
  TFM and package assets. Runtime12 can legitimately use SDK11/net11. Prefer
  `--sdk <compatible-sdk>`; TFM overrides require matching assets. These scripts
  never patch a shared SDK's `NETCoreAppMaximumVersion`.
- Missing/ambiguous packages require a rebuild or explicit version/layout options.
  Composite requires compatible workload/compiler bits.
- Caches do not account for current host load. Refresh controls when needed.
- Havit feature-detects `withDotnetReady`, warning before using the legacy ready
  callback on older runtimes. Initialization still registers imports when a
  runtime omits ready callbacks; inspect this hook when comparing revisions.
- Keep the host awake during publish and measurement. After suspension, rerun
  affected measurements rather than interpreting sleep time as a regression.

Validation results and limits are in [Local runtime validation](local-runtime-validation.md).
