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
app.MapStaticAssets();
app.UseAntiforgery();

app.MapRazorComponents<BlazorPerf.Components.App>()
    .AddInteractiveServerRenderMode()
    .AddInteractiveWebAssemblyRenderMode()
    .AddAdditionalAssemblies(typeof(Home).Assembly);

// HtmlRenderer benchmark endpoint — renders components in-process without HTTP overhead.
// Returns renders/sec for a given scenario over a duration window.
app.MapGet("/api/bench/html-render", async (string scenario, int durationMs) =>
{
    Type componentType = scenario switch
    {
        "params-count" => typeof(BlazorPerf.Components.Pages.ParametersCountSsr),
        "too-many-components" => typeof(BlazorPerf.Components.Pages.TooManyComponentsSsr),
        _ => throw new ArgumentException($"Unknown scenario: {scenario}")
    };

    var loggerFactory = app.Services.GetRequiredService<ILoggerFactory>();
    // Warmup: 3 renders discarded
    await using (var warmup = new HtmlRenderer(app.Services, loggerFactory))
    {
        for (int i = 0; i < 3; i++)
        {
            await warmup.Dispatcher.InvokeAsync(async () =>
            {
                await warmup.RenderComponentAsync(componentType);
            });
        }
    }

    var count = 0;
    var sw = Stopwatch.StartNew();
    // Recycle HtmlRenderer every 20 renders to prevent unbounded component accumulation
    while (sw.ElapsedMilliseconds < durationMs)
    {
        await using var renderer = new HtmlRenderer(app.Services, loggerFactory);
        for (int batch = 0; batch < 20 && sw.ElapsedMilliseconds < durationMs; batch++)
        {
            await renderer.Dispatcher.InvokeAsync(async () =>
            {
                await renderer.RenderComponentAsync(componentType);
            });
            count++;
        }
    }
    sw.Stop();

    var rendersPerSec = count * 1000.0 / sw.ElapsedMilliseconds;
    return Results.Json(new { rendersPerSec, count, elapsedMs = sw.ElapsedMilliseconds });
});

// HtmlRenderer stress endpoint — runs N parallel renders via Task.WhenAll.
// Returns aggregate renders/sec across all parallel tasks.
app.MapGet("/api/bench/html-render-stress", async (string scenario, int durationMs, int parallel) =>
{
    Type componentType = scenario switch
    {
        "params-count" => typeof(BlazorPerf.Components.Pages.ParametersCountSsr),
        "too-many-components" => typeof(BlazorPerf.Components.Pages.TooManyComponentsSsr),
        _ => throw new ArgumentException($"Unknown scenario: {scenario}")
    };

    parallel = Math.Clamp(parallel, 1, 200);

    var loggerFactory = app.Services.GetRequiredService<ILoggerFactory>();

    // Sequential warmup to JIT all paths before parallel execution
    await using (var warmup = new HtmlRenderer(app.Services, loggerFactory))
    {
        for (int i = 0; i < 3; i++)
        {
            await warmup.Dispatcher.InvokeAsync(async () =>
            {
                await warmup.RenderComponentAsync(componentType);
            });
        }
    }

    // Each task recycles its HtmlRenderer every 20 renders to prevent unbounded memory growth.
    var tasks = Enumerable.Range(0, parallel).Select(async _ =>
    {
        var count = 0;
        var sw = Stopwatch.StartNew();
        while (sw.ElapsedMilliseconds < durationMs)
        {
            await using var renderer = new HtmlRenderer(app.Services, loggerFactory);
            for (int batch = 0; batch < 20 && sw.ElapsedMilliseconds < durationMs; batch++)
            {
                await renderer.Dispatcher.InvokeAsync(async () =>
                {
                    await renderer.RenderComponentAsync(componentType);
                });
                count++;
            }
        }
        sw.Stop();
        return (count, sw.ElapsedMilliseconds);
    }).ToArray();

    var results = await Task.WhenAll(tasks);
    var totalCount = results.Sum(r => r.count);
    var maxElapsed = results.Max(r => r.ElapsedMilliseconds);
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
