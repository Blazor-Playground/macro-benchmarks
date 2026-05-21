using System.Diagnostics;
using BlazorPerf.Client.Pages;
using BlazorPerf.Client.Shared;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;

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

    await using var renderer = new HtmlRenderer(app.Services, app.Services.GetRequiredService<ILoggerFactory>());
    // Warmup: 3 renders discarded
    for (int i = 0; i < 3; i++)
    {
        await renderer.Dispatcher.InvokeAsync(async () =>
        {
            await renderer.RenderComponentAsync(componentType);
        });
    }

    var count = 0;
    var sw = Stopwatch.StartNew();
    while (sw.ElapsedMilliseconds < durationMs)
    {
        await renderer.Dispatcher.InvokeAsync(async () =>
        {
            await renderer.RenderComponentAsync(componentType);
        });
        count++;
    }
    sw.Stop();

    var rendersPerSec = count * 1000.0 / sw.ElapsedMilliseconds;
    return Results.Json(new { rendersPerSec, count, elapsedMs = sw.ElapsedMilliseconds });
});

app.Run();
