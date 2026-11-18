# Radzen Blazor offline gallery

The component library is **Radzen.Blazor 13.1.0 from NuGet**, pinned in
[`versions.props`](../versions.props). It is never built from component sources.

The example pages, supporting models and Northwind seed data are adapted from
[radzenhq/radzen-blazor v13.1.0](https://github.com/radzenhq/radzen-blazor/tree/v13.1.0/RadzenBlazorDemos)
(commit `22849da`), under the included [MIT license](LICENSE).

## Coverage and adaptations

- 279 routed gallery pages covering DataGrid, data binding, forms, charts,
  spreadsheets, Gantt, navigation, feedback and layout.
- Standalone Blazor WebAssembly, with the free Material theme and local assets.
- Original EF Core InMemory Northwind data, including employee photos.
- No OData/backend endpoints, AI services, uploads, maps, Gravatar, online API
  docs, runtime compiler, Monaco editor or premium UI blocks/themes.
- Service-dependent pages are omitted rather than replaced with fake network
  services. Live-update examples are excluded to avoid background timing noise.
- The site shell and example cards replace the upstream marketing and
  source-editing UI. Remote images use local images/icons; embedded tutorials
  become ordinary external links and make no requests during measurement.
  CDN-only icon-font examples are omitted; the bundled rounded Material Symbols
  font is distributed under the [Apache 2.0 license](wwwroot/fonts/LICENSE-APACHE.txt).
- The manual form-validation example uses synchronous data-annotation validation
  so the same example also builds on .NET 9.
- Demo helper components that are not gallery entries have no standalone routes.

[`GalleryPages.cs`](GalleryPages.cs) is the explicit gallery and walkthrough
inventory. The home page exposes this same list as `data-benchmark-route` links,
so navigation coverage cannot silently diverge from the app.

The app follows the SDK-selected target framework on .NET 9 and later; the
benchmark CLI explicitly skips .NET 8. Mono and CoreCLR use the standard Blazor
preset/runtime constraints.

## Walkthrough

[`radzen-walkthrough.ts`](../../bench/src/lib/radzen-walkthrough.ts) performs all
client-side navigations inside one browser evaluation. Each page must finish its
asynchronous component parameter initialization and render, followed by two
animation frames. The initial home load and final return home are not timed.
Missing readiness signals, timeouts and Blazor errors fail the measurement.

Standard startup, size, memory, build and `radzen-walkthrough` metrics are enabled
in the default daily app selection and dashboard.

```powershell
.\bench.ps1 --app radzen-blazor --runtime mono,coreclr --preset no-workload --engine chrome
```

## Offline browser validation

From the repository root, publish with the SDK/runtime under test:

```powershell
dotnet publish src\radzen-blazor\RadzenBlazor.csproj -bl:artifacts\radzen-publish.binlog -p:RuntimeFlavor=CoreCLR -p:BenchmarkPreset=NoWorkload -o artifacts\radzen-validation
$env:RADZEN_WWWROOT = (Resolve-Path artifacts\radzen-validation\wwwroot).Path
Push-Location bench
node --import tsx --test tests\radzen-walkthrough.test.ts
Pop-Location
```

The opt-in test visits every gallery entry, blocks and records external requests,
and fails on HTTP errors, browser exceptions, Blazor errors or missing routes.
It uses installed Chrome by default (`PLAYWRIGHT_CHANNEL` can override it).
On a shared SDK with stale workload manifests, disable their resolver for this
no-workload validation process with `$env:MSBuildEnableWorkloadResolver = 'false'`
before publishing. Do not edit the installed SDK or its manifests.
