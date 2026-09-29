# avalonia-bench

A minimal Avalonia.Browser app (Avalonia.Browser + SkiaSharp only, code-only, no theme) used for
startup and Avalonia-specific scenario benchmarks. Native relink is mandatory, because Skia and
HarfBuzz ship as static libraries, so only the `native-relink` and `aot` presets apply.

## Startup metrics

`wwwroot/main.mjs` reports `time-to-create-dotnet` and `time-to-reach-managed`
(Avalonia `OnFrameworkInitializationCompleted`). A UI app never exits, so there is no `time-to-exit`.
`bench_complete` is set after the first rendered frame, so scenarios start with the view attached.

## Scenarios

Scenarios run in the page through `globalThis.avaloniaBench.run(name, opts)`. There are three kinds:

- **Managed** (`ScenarioKind.Managed`): JS calls `RunIteration()` in a tight loop. Each call returns
  how many operations it performed (e.g. 100 hit tests), and the sample value is operations/sec.
  Batch small operations inside one iteration so JS↔C# interop doesn't dominate. Examples:
  - `virtualized-scroll`: an ItemsControl with a VirtualizingStackPanel over 10,000 items (code-built
    ScrollViewer/ItemsControl templates); scroll by ~7 items and run a layout pass, recycling containers.
    Rows draw a colored bar.
  - `control-templates`: add 40 Buttons with a code-built `ControlTheme` (template with template
    bindings, nested `:pointerover`/`:pressed`/`:disabled` styles, a content template for icon
    content), run a layout pass, remove them.
  - `text-layout`: 10 wrapped `TextLayout`s of pseudo-random sentences (HarfBuzz shaping, line breaking).
  - `skia-drawing`: 120 paths/shapes with gradients, dashed strokes and transforms drawn into a
    640x400 `RenderTargetBitmap` (CPU raster, so independent of the browser's GPU).
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

Only `text-layout` shapes text. The other scenarios draw rectangles, so their numbers aren't mixed
with text shaping.

To add a scenario:

1. Add a `BenchScenario` subclass under `Scenarios/` and register it in `ScenarioRegistry`.
2. Add a `MetricKey` in `bench/src/enums.ts` and its entry in `bench/src/lib/metrics.ts`.
3. Add a `WALKTHROUGHS` row in `bench/src/stages/measure.ts` using `avaloniaScenario('<name>')`.

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
