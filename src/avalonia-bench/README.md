# avalonia-bench

A minimal Avalonia.Browser app (Avalonia.Browser + SkiaSharp only, code-only, no theme) used for
startup and Avalonia-specific scenario benchmarks. Native relink is mandatory, because Skia and
HarfBuzz ship as static libraries, so only the `native-relink` and `aot` presets apply.

## Startup metrics

`wwwroot/main.mjs` reports `time-to-create-dotnet` and `time-to-reach-managed`
(Avalonia `OnFrameworkInitializationCompleted`). It also reports `time-to-exit`, which here means
**first frame rendered**, because a UI app never exits.

## Scenarios

Scenarios run in the page through `globalThis.avaloniaBench.run(name, opts)`. There are two kinds:

- **Managed** (`ScenarioKind.Managed`): JS calls `RunIteration()` in a tight loop. Each call returns
  how many operations it performed (e.g. 100 hit tests), and the sample value is operations/sec.
  Batch small operations inside one iteration so JS↔C# interop doesn't dominate. Examples:
  - `layout-pass`: invalidate ~200 TextBlocks and run a layout pass.
  - `property-set-get`: styled (style + local priority), direct and reference-type property
    set/clear/get on 1000 `AvaloniaObject`s.
  - `property-inheritance`: change an inherited attached property at the root of ~2100 controls
    (some subtrees override it).
  - `styles-class-toggle`: with ~160 global rules in `Application.Styles` (class, descendant,
    child + `:nth-child`, `:not`), toggle a class on 500 Borders.
  - `styles-attach`: with the same global rules, attach and detach a 106-control subtree.
  - `hit-test`: `InputHitTest` at pseudo-random points over ~2000 overlapping, partly rotated Borders.
- **Async** (`ScenarioKind.Async`): C# runs a whole sample in `RunSampleAsync` and returns its
  value. Use this for work that has to yield to the dispatcher or browser event loop, where a JS
  tight loop would block the queue. Examples:
  - `dispatcher-post`: batches of 1000 `Post` calls at mixed priorities, each awaited until drained.
  - `dispatcher-invoke-async`: chained `await InvokeAsync(...)` round-trips.
- **Input** (`ScenarioKind.Input`): a JS driver in `inputDrivers` (main.mjs) dispatches real DOM
  events on the element under the pointer, inside `.avalonia-container`. The C# side calls
  `BenchInterop.ScenarioSignal` once it has seen the expected input, and the sample value is
  elapsed ms. Example: `pointer-move`.
  - Build pointer events with `pointerEvent()`: synthetic events need `coalescedEvents`, or
    Avalonia's input path throws.
  - Avalonia may merge consecutive moves, so detect completion by state (for example, final
    position), not by counting events.

- **Frames** (`ScenarioKind.Frames`): the scenario animates for the sample duration while
  `RunFrameSample` counts Avalonia render ticks (`TopLevel.RequestAnimationFrame`) and reports
  frames per second. `OnFrame` runs on every tick for per-frame work; `Start`/`Stop` start and
  cancel animations. Headless Chrome is launched without a frame-rate limit, so FPS measures
  throughput rather than being capped at vsync. Examples:
  - `fps-layout-resize`: ~1200 Borders resized every frame, so a full measure/arrange cascade runs each tick.
  - `fps-render-transforms`: ~1500 Borders, each with two Avalonia keyframe animations on the UI
    thread: Opacity, and an attached `Progress` property that drives rotate/scale transforms.
    Animations must target visuals, and there is no animator for `RenderTransform` itself.
  - `fps-composition-animations`: the same visuals animated by compositor keyframe animations.
  - `fps-tree-churn`: 80 of ~800 nested subtrees removed and recreated every frame.

  All four draw only small solid rectangles, so the cost is in layout, animation, composition and
  tree management rather than Skia drawing.

To add a scenario:

1. Add a `BenchScenario` subclass under `Scenarios/` and register it in `ScenarioRegistry`.
2. For an input scenario, add a driver with the same name to `inputDrivers` in `wwwroot/main.mjs`.
3. Add a `MetricKey` in `bench/src/enums.ts` and its entry in `bench/src/lib/metrics.ts`.
4. Add a `WALKTHROUGHS` row in `bench/src/stages/measure.ts` using `avaloniaScenario('<name>')`.

Scenarios run on Chrome/desktop only, like other walkthroughs.

## Run manually in a browser

Publish with the pipeline's settings and serve `wwwroot` with any static file server:

```powershell
$env:NUGET_PACKAGES = "$PWD\artifacts\nuget-packages"
dotnet publish src/avalonia-bench -c Release /p:BenchmarkPreset=NativeRelink /p:RuntimeFlavor=Mono `
  /p:BuildLabel=manual /p:MSBuildDisableTaskHost=true -o artifacts/manual/avalonia-bench
npx --yes http-server artifacts/manual/avalonia-bench/wwwroot -p 8080 -c-1
```

Open `http://localhost:8080/?ui` for a panel with a button per scenario, sample options and a
results log. Without `?ui` the panel isn't created, so automated runs are unaffected. The same API
is available from the console: `avaloniaBench.list()` and
`await avaloniaBench.run(name, { warmup, samples, sampleDurationMs })`.

FPS in a regular browser window is capped by vsync. Start Chrome with
`--disable-gpu-vsync --disable-frame-rate-limit` to match the pipeline.

## Run locally

```powershell
npx tsx bench/src/main.ts --context <context.json> --stages build,measure `
  --app avalonia-bench --preset native-relink --runtime mono --engine chrome --profile desktop --verbose
```
