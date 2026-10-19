# Havit CoreCLR repro

Requires Node.js 22+. From the repository root:

```sh
npm ci
npm start        # Release (default): full composite ReadyToRun
npm run debug    # Debug: interpreted app, ReadyToRun CoreLib
```

Run one configuration at a time. Each command publishes the app, measures five cold/warm Chromium starts, then serves it at `http://127.0.0.1:5000`. Open the Getting started page and stop the server with Ctrl+C. The pinned .NET SDK and Chromium are installed automatically if missing.

For an agent or CI, use `npm run verify` after `npm ci`. It runs the tests, publishes and measures both configurations, writes JSON to `artifacts/results`, and exits without leaving a server running. The latest publish and binlog are in `artifacts/publish` and `artifacts/publish.binlog`.

The pinned .NET 12 SDK builds a `net11.0` app. `Debug` is the build configuration, not an attached managed debugger; this static server has no debugger proxy. Local desktop timings are not directly comparable to mobile-throttled dashboard measurements.

## Opt-in browser CoreCLR debugger workload

The workload source is based on `havit-r2r-minimal` commit `f81bab06e26b041b38119a6a153d7c94c5869486` and is maintained on the separate [`steveisok-havit-debugger-workload` branch](https://github.com/Blazor-Playground/macro-benchmarks/tree/steveisok-havit-debugger-workload). Clone that branch and record its full checkout commit for reproduction; no additional Havit source patch is required. The team's `havit-r2r-minimal` and `main` branches are not changed by this debugger workload.

`WasmDebuggerWorkload=true` selects a **fully interpreted, untrimmed Debug profile, including CoreLib, with no ReadyToRun or AOT**. This compatibility profile is not the WASM team's ordinary Debug/R2R-CoreLib or Release/composite mode. The normal `start`, `debug`, and `verify` entrypoints are unchanged. Debugger outputs, intermediate files, and restored packages are isolated in `artifacts/debugger`; the DLL metadata and runtime configuration identify the compilation mode as `fully-interpreted-no-r2r`.

`HavitDebuggerScenario=url-helper-primitive` is the default debugger scenario: ordinary fragment navigation enters the existing synchronous `UrlHelper.RemoveFragmentFromUrl`. `HavitDebuggerScenario=grid-filtering` separately retains the earlier async grid scenario for debugger regression investigation. Their entry guards are mutually exclusive; neither is compiled into ordinary benchmarks. The scenario is recorded in DLL metadata and runtime configuration.

This profile requires the complete matched browser CoreCLR prototype runtime pack, its `Microsoft.NET.Sdk.WebAssembly.Pack.12.0.0-dev.nupkg`, a separate matching `Microsoft.NETCore.App.Runtime.browser-wasm.12.0.0-dev.symbols.nupkg` extraction, and matching **host-native** debugger libraries. The DBI provides host-side debugger interfaces; the DAC reads the browser target using that target's contract descriptor. Neither is a browser WASM payload. Supply the files for the actual host OS/architecture rather than assuming `.dylib` filenames. The coordinated reproduction recipe pins runtime source `31d75f13ce73be6b6285c78b0703a79644de87ee`, which includes the integrated target descriptor and host DBI corrections; no local engine patch is required. Require the runtime owner's handoff to bind the exact immutable source pin, runtime packs, symbols, and host binaries to the same build cohort. Do not substitute native WASM alone or mix SDK/runtime loader assets.

Only the **macOS arm64** full debugger cohort has been exercised. Windows and Linux are intended reproduction targets, not validated ports; executable discovery, supported native libraries, and debugger startup must pass their own host capability checks. The central reproduction runner owns SDK/browser/VS Code discovery and the coordinated debugger/proxy launch. This repository supplies the application profile and reusable static server, not another debugger launcher.

In the coordinated `vscode-csharp` checkout, the runner's CLI contract is:

```text
npm run prototype -- preflight --config <machine-local.json>
npm run prototype -- setup --config <machine-local.json>
npm run prototype -- open havit --config <machine-local.json>
npm run prototype -- run havit 1 capability --config <machine-local.json>
npm run prototype -- run havit 3 steps --config <machine-local.json>
```

The Node entrypoint is `tasks/debugger/prototype/prototype.js`. In that owning checkout, consult `tasks/debugger/prototype/README.md`, `tasks/debugger/prototype/localConfig.example.json`, and the typed schema `tasks/debugger/prototype/prototypeConfig.ts`. The machine-local config supplies this application's completed publication, runtime/cohort manifest, PDB/source mapping, and `bench.mjs` module path; do not commit that config or assume machine paths from another run. The workload manifest records original app DLL/PDB paths, native WASM, the complete publication file inventory, handoff digest, and source files relative to the configured Havit root, paired with the same runtime cohort.

The launcher does not build Havit. Run its capability gate before a measurement batch. These commands describe the coordinated runner contract, not upstream availability or cross-host validation. The accepted macOS arm64 runs used the earlier runner; the new portable runner/proxy combination has deterministic configuration tests but has not established new end-to-end measurements. Windows/Linux configuration tests do not establish debugger support on those hosts.

### Build inputs and provenance

After `npm ci`, use the SDK pinned by `global.json`: `12.0.100-alpha.1.26509.106`, with roll-forward disabled. It compiles a `net11.0` app. Its ordinary `12.0.0-alpha.1.26509.106` WebAssembly pack is **not** interchangeable with the matched prototype `12.0.0-dev` pack. Using the ordinary pack against this target can publish successfully but fail browser startup with Webcil import errors or missing `resources.coreAssembly`. The prototype's `12.x` product/package branding and `11.0.0.0` managed assembly versions are intentional; version labels alone are not compatibility proof.

Before publishing, record the exact workload checkout commit and benchmark base, actual `dotnet --version` and `--info`, C# compiler version, Node version, complete runtime, WebAssembly SDK, and matching symbols nupkg SHA-256 values, and the host DAC/DBI SHA-256 values in an uncommitted toolchain manifest. With the resolved SDK host and root, the compiler command is `dotnet <DOTNET_ROOT>/sdk/<sdk-version>/Roslyn/bincore/csc.dll -version`; construct that path with the host's path APIs rather than a fixed filesystem prefix. The tested app compiler was `5.13.0-1.26509.106`; the runtime pack was built separately with SDK `11.0.100-rc.1.26420.103`. The central runner's manifest should also record the browser/VS Code versions when it resolves them. Do not put feed credentials or private implementation patches in this repository.

Set `DOTNET_HOST` to the resolved SDK executable, `RUNTIME_PACK` to the complete extracted **interpreted** browser-wasm runtime pack, `PACK_FEED` to the directory containing both matched runtime and WebAssembly SDK nupkgs, and `HOST_DAC`/`HOST_DBI` to the paired native library files. Inputs are consumed read-only. The following is a Bash build example; on other shells invoke the resolved SDK with the same argument values using that shell's syntax or a Node argument array. The debugger launcher consumes the completed publish; it does not run this build:

```sh
"$DOTNET_HOST" --version
"$DOTNET_HOST" --info
"$DOTNET_HOST" publish \
  src/havit-bootstrap/HavitBootstrap.csproj -c Debug \
  -p:WasmDebuggerWorkload=true \
  -p:HavitDebuggerScenario=url-helper-primitive \
  -p:RuntimePackDir="$RUNTIME_PACK" \
  -p:RestoreAdditionalProjectSources="$PACK_FEED" \
  -p:RestorePackagesPath="$PWD/artifacts/debugger/packages/" \
  -o artifacts/debugger/publish -bl:artifacts/debugger-publish.binlog -m:1
```

For symbol staging, also set `RUNTIME_SYMBOLS` to the separately supplied RuntimeSymbolsRoot: the complete `data/` and `runtimes/` extraction of the matching symbols nupkg (the runtime owner's handoff field is `runtimeSymbolsRoot`). The shipping CoreLib DLL is at `RUNTIME_PACK/runtimes/browser-wasm/lib/net11.0/System.Private.CoreLib.dll`, **not** under `native/`. The scoped shipping pack does not contain portable PDBs; CoreLib and the other runtime PDBs are under `RUNTIME_SYMBOLS/runtimes/browser-wasm/lib/net11.0/`. Before staging, verify the supplied extraction inventories and DLL/PDB CodeView GUID, timestamp, and age against that same cohort; the symbols package's DLLs must match the consumer pack's DLLs. Keep both roots read-only and separate: the symbols root is not an overlay or replacement runtime pack.

Portable staging uses original-name debugger lookup copies alongside, not in place of, the fingerprinted browser resources. The runner can use Node's host-aware path APIs for these operations, with absolute supplied input paths; missing inputs fail before copying:

```js
import { copyFile, readdir, stat } from 'node:fs/promises';
import { basename, isAbsolute, join } from 'node:path';

const framework = join('artifacts', 'debugger', 'publish', 'wwwroot', '_framework');
const bin = join('artifacts', 'debugger', 'bin', 'HavitBootstrap', 'Debug', 'net11.0');
function requiredInput(name) {
    const value = process.env[name];
    if (!value || !isAbsolute(value)) throw new Error(`${name} must be a supplied absolute path.`);
    return value;
}
const runtimeLib = join(requiredInput('RUNTIME_PACK'), 'runtimes', 'browser-wasm', 'lib', 'net11.0');
const symbolsLib = join(requiredInput('RUNTIME_SYMBOLS'), 'runtimes', 'browser-wasm', 'lib', 'net11.0');
const hostFiles = [requiredInput('HOST_DAC'), requiredInput('HOST_DBI')];
const symbolNames = (await readdir(symbolsLib)).filter(name => name.endsWith('.pdb'));
if (!symbolNames.includes('System.Private.CoreLib.pdb')) {
    throw new Error('RUNTIME_SYMBOLS must supply the matching System.Private.CoreLib.pdb.');
}
const copies = [[join(runtimeLib, 'System.Private.CoreLib.dll'), 'System.Private.CoreLib.dll']];
for (const name of await readdir(bin)) {
    if (/\.(dll|pdb)$/.test(name)) copies.push([join(bin, name), name]);
}
for (const name of symbolNames) copies.push([join(symbolsLib, name), name]);
for (const file of hostFiles) copies.push([file, basename(file)]);
if (!(await stat(framework)).isDirectory()) throw new Error(`Missing published framework directory: ${framework}`);
for (const [source] of copies) {
    if (!(await stat(source)).isFile()) throw new Error(`Required lookup input is not a file: ${source}`);
}
for (const [source, name] of copies) {
    await copyFile(source, join(framework, name));
}
```

Use a new output/cache directory for a new cohort and keep the paths in publishing and staging consistent. Prototype cohorts reuse the `12.0.0-dev` package version: a fresh `RestorePackagesPath` is required when package bytes change, even if the version string does not. Preserve the previous complete publication and pack for rollback; do not overlay a new runtime into an old publish.

The debugger `assetsPath` is the staged `_framework` directory. The application assembly is `Havit.Blazor.Documentation.dll`, not the project basename, with `Havit.Blazor.Documentation.pdb`. Verify the DLL/portable-PDB identity and source checksums, every emitted boot resource's integrity hash, compressed `.br`/`.gz` bytes, and the native cohort before marking the publication ready. Some third-party packages do not distribute PDBs; record missing symbols rather than claiming every dependency is symbolized. Map the PDB's build checkout prefix to the local source snapshot with `sourceFileMap`. Regenerate fingerprints and integrity through publishing; do not rewrite the boot manifest to accommodate lookup copies.

Serve without invoking startup measurement, using the existing `bench.mjs` export. It provides SPA fallback, compression, and COOP/COEP headers. The same operations can be called directly by the central runner:

```js
import { startServer } from './bench.mjs';
import { join } from 'node:path';

const server = await startServer(join('artifacts', 'debugger', 'publish', 'wwwroot'), 8001);
console.log(server.url);
process.once('SIGINT', () => server.close());
process.once('SIGTERM', () => server.close());
```

### Existing application entry and measurement boundary

The static server is not a debugger proxy. Use the coordinated browser CoreCLR debugger integration with matched native assets. Start at `/components/HxGrid` **without a fragment**, so initial rendering does not trigger the guarded entry. After managed attach and the first render complete, click the existing desktop "Filtering from headers" link: `.on-this-page-navigation.side-page-navigation a[href$="#header-filtering"]` at a desktop viewport of at least 992 pixels. Verify the actual unique connected, visible anchor and its full `href` before clicking; responsive navigation also contains other copies, so the broader `.on-this-page-navigation` selector is not necessarily unique.

The pinned Blazor loader handles that same-page fragment click entirely in JavaScript: it updates browser history and scrolls without notifying managed `LocationChanged`. The click alone therefore does **not** enter the URL helper. Use ordinary browser **Back**, wait for the no-fragment URL, then **Forward** to the existing `#header-filtering` history entry. This is runner-only preparation outside timing; do not synthesize managed navigation calls or change the application to bypass the loader's behavior.

The normal browser history `popstate` path notifies managed navigation and calls `OnThisPageNavigation.LoadItems`, then `DocPageNavigationItemsTracker.GetPageNavigationItems`, then the URL helper. Its compile-gated break requires the exact `/components/HxGrid#header-filtering` page/fragment suffix and real `Debugger.IsAttached`, without hardcoding a host or port. The original null handling, index assignment, return expression, and navigation behavior remain unchanged.

Use the current portable PDB's sequence points, not line numbers from another build. Prepare outside timing until the existing `int hashIndex = url.IndexOf('#');` statement, then time only its ordinary Step Over to the return expression and the return expression's Step Over to the closing brace. Stop before stepping out into navigation/rendering. Baseline Locals are the actual `url` string and scalar `hashIndex`; the latter is unassigned before the index statement and must equal the actual triggered URL's fragment index afterward. For example, `http://127.0.0.1:8001/components/HxGrid#header-filtering` has index 39, but a different origin/port changes the expected value. Normal visible Call Stack/Locals refresh must pass the debugger capability pilot before measurement. App startup, the anchor click, Back/Forward preparation, rendering, and explicit watch/evaluation requests are outside this stepping baseline.

In the accepted source snapshot (`9ce0cb65508d1732f993d72edcecfd1f5a794477`), the guard break was `Services/UrlHelper.cs:15`, untimed preparation visited `16` then `18`, and the two timed transitions were `18 -> 19 -> 20`. The workflow-mode change below shifts these lines; derive them from the current portable PDB rather than reusing these numbers. The observed UI initially displayed `hashIndex = 0`, then the actual URL's fragment index after assignment; this is an observation, not a promise about an unassigned local in other builds. Derive the expected value from the actual recorded anchor URL with `new URL(anchor.href).href.indexOf('#')`.

#### Workflow mode: two user breaks

The `url-helper-primitive` profile also supports the six-phase debugger workflow: pause at a first user break, inspect, resume to a second user break, inspect again, then Step Over. Both breaks use the same trigger and guard: the exact `/components/HxGrid#header-filtering` suffix plus `Debugger.IsAttached`. Both are compiled only with `HAVIT_DEBUGGER_URL_WORKLOAD`.

- **First break:** `Debugger.Break()` in static `UrlHelper.RemoveFragmentFromUrl`.
  - Its expandable local is `string[] urlParts`, a non-empty `url.Split('#')`.
  - Its caller is the instance method `DocPageNavigationItemsTracker.GetPageNavigationItems`. That `this` has only the `_itemsByPage` dictionary field.
- **Second break:** after the first break returns, the same tracker call runs `UrlHelper.BreakAfterFragmentRemoved(url, pageKey)` synchronously. A plain resume therefore reaches its `Debugger.Break()` with no further UI action.
  - Its expandable local is `string[] removedParts`, holding the page key and the removed `#fragment`.
  - Its caller is the same tracker method and instance.
- **Final Step Over:** from the second break it stops at the following `GC.KeepAlive(removedParts);` line.

The arrays avoid property-getter evaluation when Locals are expanded. Original null handling, index assignment, return expression and navigation behavior are unchanged.

Keep the debugger's default implicit UI evaluation policy unchanged. The baseline adds no explicit watch/evaluation requests or object expansion; absence of an evaluation marker in a log is not proof that implicit evaluation never occurred. Store raw reports and large artifacts with the central reproduction results, not in this repository's source commits.

The separate `grid-filtering` regression scenario uses the existing `input[placeholder="Type to search Name"]` with `John`. Its service break remains after the existing 80 ms delay and filter assignment, but stepping from the guard's closing brace to the next data statement is an unresolved debugger regression. Selecting the synchronous URL baseline does not fix or measure that failure. No diagnostic logging is part of either baseline.
