using System.Diagnostics;
using BlazorPerf;
using BlazorPerf.Client.Pages;
using BlazorPerf.Client.Shared;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;

// Ensure thread pool can handle high parallelism in stress endpoints (100+ concurrent HtmlRenderer dispatchers)
ThreadPool.SetMinThreads(200, 200);

// Start collecting EventCounters for OTEL metrics endpoint
var otelCollector = new EventCounterCollector();

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents()
    .AddInteractiveWebAssemblyComponents();

// Aggressively dispose disconnected circuits to prevent blocking subsequent connections
builder.Services.AddServerSideBlazor(options =>
{
    options.DisconnectedCircuitMaxRetained = 0;
    options.DisconnectedCircuitRetentionPeriod = TimeSpan.Zero;
});

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
}

app.UseStaticFiles();
#if NET9_0_OR_GREATER
app.MapStaticAssets();
#endif
app.UseAntiforgery();

app.MapRazorComponents<BlazorPerf.Components.App>()
    .AddInteractiveServerRenderMode()
    .AddInteractiveWebAssemblyRenderMode()
    .AddAdditionalAssemblies(typeof(Home).Assembly);

// HtmlRenderer benchmark endpoint — renders components in-process without HTTP overhead.
// Returns renders/sec for a given scenario over a duration window.
app.MapGet("/api/bench/html-render", async (string scenario, int durationMs) =>
{
    var componentType = ResolveComponentType(scenario);
    var loggerFactory = app.Services.GetRequiredService<ILoggerFactory>();

    await WarmupAsync(app.Services, loggerFactory, componentType);
    var (count, elapsedMs) = await RunRenderLoopAsync(app.Services, loggerFactory, componentType, durationMs);

    var rendersPerSec = count * 1000.0 / elapsedMs;
    return Results.Json(new { rendersPerSec, count, elapsedMs });
});

// HtmlRenderer stress endpoint — runs N render loops concurrently and reports aggregate renders/sec.
app.MapGet("/api/bench/html-render-stress", async (string scenario, int durationMs, int parallel) =>
{
    var componentType = ResolveComponentType(scenario);
    parallel = Math.Clamp(parallel, 1, 200);
    var loggerFactory = app.Services.GetRequiredService<ILoggerFactory>();

    await WarmupAsync(app.Services, loggerFactory, componentType);

    // Task.Run is REQUIRED for real concurrency. HtmlRenderer.Dispatcher.InvokeAsync runs the render
    // delegate INLINE on an uncontended dispatcher, so the `await` inside RunRenderLoopAsync never
    // yields. Without Task.Run, Select(...).ToArray() would run each loop to completion before
    // starting the next, turning N "parallel" tasks into N sequential ones (N*durationMs total).
    // Task.Run dispatches each loop onto its own thread-pool thread so they truly overlap.
    var tasks = Enumerable.Range(0, parallel)
        .Select(_ => Task.Run(() => RunRenderLoopAsync(app.Services, loggerFactory, componentType, durationMs)))
        .ToArray();

    var results = await Task.WhenAll(tasks);
    var totalCount = results.Sum(r => r.Count);
    var maxElapsed = results.Max(r => r.ElapsedMs);
    var rendersPerSec = totalCount * 1000.0 / maxElapsed;

    return Results.Json(new { rendersPerSec, totalCount, parallel, maxElapsedMs = maxElapsed });
});

// OTEL metrics endpoint — returns current EventCounter values as a JSON snapshot.
// TypeScript bench CLI polls this before/after stress windows to compute deltas.
app.MapGet("/api/bench/metrics", () =>
{
    return Results.Json(otelCollector.GetSnapshot());
});

// Reset endpoint — forces full GC and clears counter baseline before each stress scenario.
// Call this, wait ~2s for counters to settle, then take "before" snapshot.
app.MapPost("/api/bench/reset", () =>
{
    // Force full GC to clear residual allocations from previous test
    GC.Collect(2, GCCollectionMode.Aggressive, blocking: true, compacting: true);
    GC.WaitForPendingFinalizers();
    GC.Collect(2, GCCollectionMode.Aggressive, blocking: true, compacting: true);

    // Clear accumulated counter values so next snapshot starts fresh
    otelCollector.Reset();

    return Results.Ok(new { reset = true });
});

app.Run();

// Maps a scenario name to the component type it renders.
static Type ResolveComponentType(string scenario) => scenario switch
{
    "params-count" => typeof(BlazorPerf.Components.Pages.ParametersCountSsr),
    "too-many-components" => typeof(BlazorPerf.Components.Pages.TooManyComponentsSsr),
    _ => throw new ArgumentException($"Unknown scenario: {scenario}")
};

// Renders a component once on its renderer's dispatcher.
static Task RenderOnceAsync(HtmlRenderer renderer, Type componentType) =>
    renderer.Dispatcher.InvokeAsync(async () => await renderer.RenderComponentAsync(componentType));

// Discards a few renders so all JIT/allocation paths are warm before measuring.
static async Task WarmupAsync(IServiceProvider services, ILoggerFactory loggerFactory, Type componentType)
{
    await using var warmup = new HtmlRenderer(services, loggerFactory);
    for (int i = 0; i < 3; i++)
    {
        await RenderOnceAsync(warmup, componentType);
    }
}

// Renders in a tight loop until durationMs elapses, recycling the HtmlRenderer every 20 renders to
// bound the growth of its internal _componentStateById dictionary (it retains every rendered
// component's state until disposal). Returns the render count and the actual elapsed time.
static async Task<(int Count, long ElapsedMs)> RunRenderLoopAsync(
    IServiceProvider services, ILoggerFactory loggerFactory, Type componentType, int durationMs)
{
    var count = 0;
    var sw = Stopwatch.StartNew();
    while (sw.ElapsedMilliseconds < durationMs)
    {
        await using var renderer = new HtmlRenderer(services, loggerFactory);
        for (int batch = 0; batch < 20 && sw.ElapsedMilliseconds < durationMs; batch++)
        {
            await RenderOnceAsync(renderer, componentType);
            count++;
        }
    }
    sw.Stop();
    return (count, sw.ElapsedMilliseconds);
}
