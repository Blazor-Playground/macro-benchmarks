# Measure Havit with a local runtime

[macro-benchmarks](https://github.com/Blazor-Playground/macro-benchmarks) provides
the Havit app and measurement harness.
[dotnet/runtime](https://github.com/dotnet/runtime) provides your changed runtime.
Run benchmark commands from macro-benchmarks; runtime build commands from the
runtime checkout. No SDK or ASP.NET source checkout is required.

## Quick start

**Composite R2R is the default for both CoreCLR sides. No variant flag is needed.**

```bash
node bench/bootstrap.mjs <path-to-local-runtime-build>
# Edit that runtime checkout, then:
node bench/iterate.mjs
```

The path is the **dotnet/runtime checkout root**, not `artifacts/` or Shipping.
Omit it to create a managed checkout under `artifacts/local-runtime-comparisons/`.
Bootstrap starts potentially expensive native builds; allow enough disk space
for two clean controls and the changed build.

| Role | Source | Default mode |
|---|---|---|
| Mono before | Separate clean merge-base clone | Interpreter |
| CoreCLR before | Separate clean merge-base clone | Composite R2R |
| CoreCLR after | Supplied checkout, including local edits | Composite R2R |

Defaults: Release, Chrome desktop/mobile, 10 cold loads and 5 warm reloads per
profile, and one desktop walkthrough. Installed Chrome is preferred; otherwise
Playwright Chromium is used. Checkout, browser and forwarded options are saved
in `artifacts/local-runtime/quick-start.json`.

Optional changes are remembered:

```bash
node bench/iterate.mjs --variant r2r       # Non-composite R2R on both sides
node bench/iterate.mjs --variant composite # Return to composite
node bench/iterate.mjs -- --cold-runs 3 --warm-runs 2
```

`--variant aot` is also accepted for CoreCLR R2R. Version-1 interpreter settings
require another bootstrap; version-2 mixed-mode settings migrate with a notice
to matching variants.

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

Every run checks tools, dependencies, browser launch and baseline history before
building. Missing prerequisites are reported with installation commands; nothing
is installed automatically. To check only:

```bash
node bench/compare-local-runtime.mjs --check-prerequisites \
  --runtime-repo <path-to-local-runtime-build> -- --system-chrome
```

GNU tar cannot read `.nupkg` ZIP archives. On Debian/Ubuntu, install
`libarchive-tools`; on Fedora, install `bsdtar`. Quick start selects bsdtar when
needed. `BENCH_TAR=bsdtar` also selects it for the lower-level publisher.

## Source preservation and cache behavior

Before is `git merge-base HEAD refs/remotes/origin/main`, using the local tracking
ref. Fetch it yourself if needed; the scripts do not fetch automatically.
The supplied checkout is **after only**: its HEAD, index and local source are not
switched, reset, cleaned or stashed. Runtime builds still create generated outputs.

Passed before measurements are reused only for matching revision, runtime mode,
configuration, benchmark/dependency setup, SDK overrides, browser/Node versions
and host identity. Both controls are cached independently; a valid cache skips
their build, packaging, publish and measurement. Every iteration rebuilds and
measures after.

`--force-before` refreshes automatic controls for that invocation. Missing owned
source clones are recreated; modified or out-of-root clones cause an error.
Missing evidence invalidates reuse; corrupt records fail explicitly.
Do not run concurrent comparisons against the same runtime checkout. After a
forced interruption, remove only `.comparison-lock` once no comparison is running.

Requested refs in new managed clones stay pending until checkout is confirmed.
If selection fails, iteration is blocked. Select the intended revision yourself
and bootstrap that path, or retry in a new output directory. Build failures after
confirmed selection can be retried with `iterate`.

## Results

```bash
node bench/runtime-bench.mjs results
# Select another saved comparison:
node bench/compare-local-runtime.mjs --display-results <comparison.json>
```

Bare `--display-results` selects the latest **after measurement timestamp**.
It reads saved evidence without building, checking prerequisites or querying live
Git. Removed indexed comparisons warn and skip; surviving corruption remains an
error.

The summary matches default NET12 focus:

| Metric | Profile |
|---|---|
| Cold startup to managed | Mobile |
| Havit walkthrough | Desktop |
| Encoded cold download, decimal MB | Desktop |
| Havit publish time, excluding restore/runtime builds | Desktop |

Leading percentage columns are **NET12 focus** (CoreCLR after vs Mono before)
and **CoreCLR change** (CoreCLR after vs CoreCLR before). Definitions are below
the table. Without a Mono control, the footer states that the first column uses
after vs before. Missing profiles/metrics remain unavailable, never substituted.

Each side shows its actual variant, recorded checkout path, full commit, dirty
status, SDK/TFM, package versions and sample counts. A dirty flag is not a saved
source diff: retain your own patch to reproduce edits. Warm samples remain in
the result JSON even though warm startup is not a focus-card row.

Commands show end-of-line `[RUNNING]`, `[OK]`, `[FAILED]` or `[CACHED]`.
Capable terminals use bold and green/red/white; redirected output and `NO_COLOR`
remain plain. Colors indicate direction, not statistical significance.

### Output locations

All generated outputs are ignored by Git.

| Location | Contents |
|---|---|
| `artifacts/local-runtime-comparisons/before/` | Verified control cache records |
| `artifacts/local-runtime-comparisons/before-source/` | Owned source-clone pointers |
| `artifacts/local-runtime-comparisons/comparison-*/` | Build logs, `comparison.json`, portable `dashboard.json` |
| `artifacts/local-runtime/<run>/` | Inputs, selected SDK/feed config, manifest, publish, logs and raw/aggregated results |

Havit intermediates use `artifacts/{obj,bin}/HavitBootstrap/<build-label>/`.
Retain manifests, statuses, results and publishes needed for a comparison.
Delete only specific completed run directories, not the runtime source checkout.

For the local chart, see [Local runtime comparisons](dashboard.md#local-runtime-comparisons).
It uses explicit custom-build data, not published SDK history.
See [metrics.md](metrics.md) for metric definitions and aggregation.

## Advanced drivers

`compare-local-runtime.mjs` builds, publishes and measures. It defaults to matched
CoreCLR composite modes, or Mono interpreter when `--runtime mono` is selected.
`--include-mono-before` adds the clean interpreter control; quick start enables it.
`--before-variant` explicitly allows a different before mode.

`--mono-before <manifest.json>` instead uses a measured pristine Mono source build
at the baseline commit. It takes precedence over automatic Mono measurement.
Setup differences and unverified browser/harness compatibility are recorded as
warnings; do not interpret it as a matched control without checking those warnings.

Publishing defaults to `<runtime>/.dotnet`, honoring the checkout's `global.json`.
Use `--sdk <directory>` for a shared/compatible SDK or to hold all Havit publishes
to one SDK without changing runtime build SDKs. `--tfm` and `--aspnet-version`
apply to both sides. Different SDKs are warned; the runtime's bootstrap SDK is
not a complete from-source SDK/ASP.NET build.

`local-runtime.mjs` publishes an **already-built** runtime and never runs its
source build. Its default is interpreter, unlike quick start:

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

After manual runtime edits, rerun **both build and packaging** before publishing.
Same-version local packages are restored into a fresh per-publish cache, mapped
exclusively to the local feed and SHA-512 verified.
Public packages use the official dotnet-public mirror; other repository feeds
and explicit `--exclude-source <key>` selections remain available. Generated
per-run config records this policy; repository/runtime feeds and TLS settings
are not changed.

To remeasure an existing publish without rebuilding:

```bash
node --import ./bench/node_modules/tsx/dist/loader.mjs \
  bench/src/scripts/measure-local-runtime.ts <manifest.json> \
  --system-chrome --profile desktop,mobile
```

Publish integrity, exact requested rows/samples and positive startup values are
checked. Chrome/desktop also requires successful navigation. Chrome/mobile and
Firefox/desktop have startup measurements only; Firefox needs its Playwright
browser installed. Use `--help` on each driver for the full option list.

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

Windows equivalents, from a Developer Command Prompt:

```cmd
build.cmd clr+libs+host -os browser -arch wasm -c Release /p:RuntimeFlavor=CoreCLR
build.cmd packs.product -os browser -arch wasm -c Release /p:RuntimeFlavor=CoreCLR
```

```cmd
build.cmd mono+libs -os browser -arch wasm -c Release /p:RuntimeFlavor=Mono
rem Optional: Mono AOT only.
build.cmd mono.aotcross -os browser -arch wasm -c Release /p:RuntimeFlavor=Mono
build.cmd packs.product -os browser -arch wasm -c Release /p:RuntimeFlavor=Mono
```

Expected outputs:

```text
<runtime>/.dotnet/dotnet                          # dotnet.exe on Windows
<runtime>/artifacts/packages/Release/Shipping/    # runtime + WebAssembly .nupkg files
<runtime>/artifacts/bin/Crossgen2Tasks/Release/   # DLL, CrossGen props/targets
<runtime>/artifacts/bin/coreclr/browser.wasm.Release/<host-arch>/crossgen2/
```

Shipping contains versioned `Microsoft.NETCore.App.Runtime.browser-wasm`
(CoreCLR) or `Microsoft.NETCore.App.Runtime.Mono.browser-wasm` (Mono), plus
`Microsoft.NET.Sdk.WebAssembly.Pack` packages.

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
- Missing or ambiguous packages/tools are errors. Rebuild and package, or select
  versions/layouts with the publisher's `--help` options. Composite requires a
  workload pack and compiler that support it; partial startup without navigation
  is not a successful measurement.
- Cached controls cannot account for current host contention. Refresh them when
  needed and keep SDK, browser, configuration and host conditions comparable.

Validation results and limits are in [Local runtime validation](local-runtime-validation.md).
