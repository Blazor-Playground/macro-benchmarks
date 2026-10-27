using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using System.Text.Json;
using BenchViewer.Interop;
using BenchViewer.Models;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Routing;

namespace BenchViewer.Pages;

[SupportedOSPlatform("browser")]
public partial class Net12Debug
{
    [SupplyParameterFromQuery(Name = "local")] public bool Local { get; set; }
    [Inject] private NavigationManager Navigation { get; set; } = default!;
    private static readonly (string Value, string Label)[] Ranges =
        [("14d", "14 days"), ("1m", "1 month"), ("3m", "3 months"), ("6m", "6 months"), ("12m", "12 months")];
    private static readonly (string Id, string Title, string Description, string[] MetricIds)[] MetricGroups =
    [
        ("run", "Run to first render", "From starting the command to seeing the app. Compare the first build with an edited, previously built app.",
            ["first-run", "incremental-run"]),
        ("edit", "Incremental development loop", "From saving a change to seeing the update. Hot reload keeps the app running; a rebuild restarts it.",
            ["hot-reload", "rebuild"]),
        ("optional", "Walkthrough (optional)", "App interaction speed after startup, separate from run and edit timings.",
            ["walkthrough"]),
    ];
    private string owner = "", app = "havit-bootstrap", range = "14d";
    private bool loading = true, measurements = true, percentage, renderCharts, disposed, sessionLocal;
    private bool methodologyRequested;
    private long generation;
    private string? error;
    private DebugReport? report;

    protected override void OnInitialized()
    {
        methodologyRequested = new Uri(Navigation.Uri).Fragment == "#debug-methodology";
        Navigation.LocationChanged += LocationChanged;
    }

    private void LocationChanged(object? sender, LocationChangedEventArgs args)
    {
        if (disposed) return;
        methodologyRequested = new Uri(args.Location).Fragment == "#debug-methodology";
        if (methodologyRequested) StateHasChanged();
    }

    private void RequestMethodology() => methodologyRequested = true;
    private void CancelMethodologyRequest() => methodologyRequested = false;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (disposed) return;
        if (firstRender || sessionLocal != Local)
        {
            sessionLocal = Local;
            if (owner.Length > 0)
            {
                var previousOwner = owner;
                owner = "";
                try { DebugInterop.Dispose(previousOwner); }
                catch (JSException exception) { ShowError(exception); StateHasChanged(); return; }
            }
            await Load(false);
            return;
        }
        if (renderCharts && !loading && error == null && report != null)
        {
            renderCharts = false;
            try { DebugInterop.Render(owner, measurements, percentage); }
            catch (JSException exception) { ShowError(exception); StateHasChanged(); }
        }
        if (methodologyRequested)
        {
            try
            {
                DebugInterop.RevealMethodology();
                // Reposition when the pending report changes the page height.
                methodologyRequested = loading;
            }
            catch (JSException exception)
            {
                methodologyRequested = false;
                ShowError(exception); StateHasChanged();
            }
        }
    }

    private async Task Load(bool force)
    {
        var request = ++generation;
        loading = true; error = null; report = null; renderCharts = false;
        StateHasChanged();
        try
        {
            if (owner.Length == 0) owner = DebugInterop.Create(Navigation.BaseUri, Local);
            var json = await DebugInterop.Load(owner, app, range, force);
            if (disposed || request != generation) return;
            var result = JsonSerializer.Deserialize(json, DebugJsonContext.Default.DebugLoadResult)
                ?? throw new JsonException("Empty Debug response");
            if (result.Status == "cancelled") return;
            if (result.Status != "ready" || result.Report is not { Metrics.Count: 5 } loaded || loaded.App != app || loaded.Range != range)
                throw new JsonException("Invalid clean-Debug report");
            report = loaded; loading = false; renderCharts = true;
        }
        catch (Exception exception) when (exception is JSException or JsonException)
        {
            if (!disposed && request == generation) ShowError(exception);
        }
        if (!disposed && request == generation) StateHasChanged();
    }

    private void ShowError(Exception exception)
    {
        Console.Error.WriteLine($"NET12 Debug: {exception}");
        error = exception.Message; loading = false; renderCharts = false;
    }
    private async Task ChangeApp(ChangeEventArgs args) { app = args.Value?.ToString() ?? app; await Load(false); }
    private async Task ChangeRange(string value) { range = value; await Load(false); }
    private void ChangeMeasurements(ChangeEventArgs args) { measurements = args.Value is true; renderCharts = report != null; }
    private void ChangePercentage(ChangeEventArgs args) { percentage = args.Value is true; renderCharts = report != null; }
    private Task Refresh() => Load(true);
    public void Dispose()
    {
        disposed = true; generation++;
        Navigation.LocationChanged -= LocationChanged;
        if (owner.Length == 0) return;
        try { DebugInterop.Dispose(owner); }
        catch (JSException exception) { Console.Error.WriteLine($"NET12 Debug disposal: {exception}"); }
    }
}
