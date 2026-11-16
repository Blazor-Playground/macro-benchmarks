# inspect-web

[Inspect Web](https://github.com/richlander/dotnet-inspect/tree/main/inspect-web) is the
browser-wasm build of [dotnet-inspect](https://github.com/richlander/dotnet-inspect): a
TypeScript UI over a large .NET inspection engine (System.Reflection.Metadata, IL analysis,
package acquisition) running in a Web Worker. It adds a compute-bound, real-world C# workload to
the suite. **Prototype:** opt-in only (`--app inspect-web`) and limited to .NET 12 SDKs.

## How it is built

The app is ~80 projects, so it is not vendored. `InspectWeb.csproj` is a plain MSBuild wrapper
whose `Restore`/`Publish` targets run `build.mjs`:

1. Check out the commit pinned by `InspectWebCommit` into
   `artifacts/external/dotnet-inspect/<sha>`.
2. Patch it for the benchmark SDK: delete its exact-SDK `global.json`, and route the projects
   that hardcode `net11.0` through `$(DefaultTargetFramework)`, which the wrapper sets to
   `$(BenchmarkTargetFramework)` for the whole graph.
3. Restore `DotnetInspect.Web` with `NuGet.inspect-web.config` (upstream uses central package
   management, which requires source mapping), forwarding `BenchmarkPreset` and
   `RuntimeFlavor`. `inner.props` imports this repo's `presets.props`/`runtimes.props` into
   every project via `CustomAfterMicrosoftCommonProps`.
4. Build the Vite frontend once per checkout. Upstream's facade generator only looks for the
   Mono runtime pack, so `build.mjs` passes the restored pack's `dotnet.d.ts` via `DOTNET_DTS`.
5. Download the nuget.org responses listed in `fixtures.json`.
6. On publish, run the inner `dotnet publish` (compile time includes it), then stage
   `bench-ready.js` and the fixtures into `wwwroot`.

`WasmEnableExceptionHandling=true` is forced because upstream hardcodes `false`, which needs a
native relink. CoreCLR builds don't import the wasm-tools workload (no native relink is needed), which avoids a
redundant nested publish. `build.mjs` passes a normalized `ArtifactsPath`: upstream's unnormalized
`src/../artifacts` path makes the WebAssembly SDK's stale-R2R prune delete the images it just
compiled, so the app silently shipped without R2R code. Supported presets are `no-workload` and `aot`; from-source runtime packs
(`RuntimePackDir`) are rejected because the inner build doesn't import
`src/Directory.Build.targets`.

## How it is measured

- **Startup:** `bench-ready.js` opts the page into Inspect Web's published-runtime benchmark
  bridge (`?runtime-benchmark=1`) and reports `time-to-reach-managed` when the Worker's managed
  engine answers its first request. `time-to-create-dotnet`, `time-to-exit` and
  `wasm-memory-size` are not reported (the runtime lives in the Worker); `memory-peak` only
  reflects the page's JS heap.
- **`inspect-web-walkthrough`** (`bench/src/lib/inspect-web-walkthrough.ts`): with nuget.org
  routed to the fixtures, runs `queryPackage`, `queryPackagePerformance` and `queryMemberFacts`
  for 24 evenly spaced members of Microsoft.Extensions.Primitives 10.0.0, validating type,
  member and opportunity counts. Unexpected external requests fail the run.

Known gap: during plain cold/warm loads the app fetches the nuget.org service index and one
registration page in the background. These are not routed, so they count toward download size
and need network access, but `time-to-reach-managed` doesn't wait for them.

## Updating the pin

Bump `InspectWebCommit`, then run the build and walkthrough. If the walkthrough reports
unexpected external requests, add them to `fixtures.json`. If counts change, update
`SCENARIO.expected` in the walkthrough.

```bash
./bench.sh --stages build,measure --app inspect-web --runtime coreclr --preset no-workload \
  --engine chrome --profile desktop --sdk-channel 12.0 --verbose
```
