using System.Text.Json;
using System.Runtime.InteropServices.JavaScript;
using BenchViewer.Interop;
using BenchViewer.Models;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace BenchViewer.Pages;

public partial class Home : IAsyncDisposable
{
    private ViewIndex? viewIndex;
    private string currentApp = "";
    private List<string> currentMetrics = new();
    private bool loading = true;
    private string? error;

    // Filter state
    private Dictionary<string, List<string>> filterGroups = new();
    private Dictionary<string, HashSet<string>> checkedValues = new();

    // Selected commit points (shown in right panel) — FIFO, max 2
    private SelectedPointInfo? selectedPoint;
    private SelectedPointInfo? previousPoint;

    // Show GA release data
    private bool showReleases = true;

    // Show daily release data
    private bool showDailyReleases = true;

    private bool initialized;

    [System.Runtime.Versioning.SupportedOSPlatform("browser")]
    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (!firstRender || initialized) return;
        initialized = true;

        try
        {
            var indexJson = await ChartInterop.InitDashboard("https://blazor-playground.github.io/macro-benchmarks/data/views");
            viewIndex = JsonSerializer.Deserialize<ViewIndex>(indexJson);

            if (viewIndex == null || viewIndex.Apps.Count == 0)
            {
                error = "No benchmark data available.";
                loading = false;
                StateHasChanged();
                return;
            }

            // Register point click callback
            ChartInterop.RegisterPointClickCallback(OnChartPointClick);

            // Initialize filters from dimensions
            filterGroups = new Dictionary<string, List<string>>
            {
                ["runtimes"] = viewIndex.Dimensions.Runtimes,
                ["presets"] = viewIndex.Dimensions.Presets,
                ["profiles"] = viewIndex.Dimensions.Profiles,
                ["engines"] = viewIndex.Dimensions.Engines,
            };

            // Check all by default, except specific groups with preferred defaults
            checkedValues = new Dictionary<string, HashSet<string>>
            {
                ["runtimes"] = new HashSet<string>(filterGroups["runtimes"]),
                ["presets"] = new HashSet<string> { "no-workload" },
                ["profiles"] = new HashSet<string> { "mobile" },
                ["engines"] = new HashSet<string> { "chrome" },
            };

            // Sort apps by preferred order
            viewIndex.Apps.Sort((a, b) =>
            {
                var ia = DashboardConfig.AppOrder.IndexOf(a);
                var ib = DashboardConfig.AppOrder.IndexOf(b);
                if (ia < 0) ia = int.MaxValue;
                if (ib < 0) ib = int.MaxValue;
                return ia.CompareTo(ib);
            });

            // Select first app
            currentApp = viewIndex.Apps[0];
            currentMetrics = GetFilteredMetrics(currentApp);

            loading = false;
            StateHasChanged();

            // Wait for DOM to render canvas elements, then load charts
            await Task.Yield();
            await LoadChartsForCurrentApp();
        }
        catch (Exception ex)
        {
            error = $"Failed to load dashboard: {ex.Message}";
            loading = false;
            StateHasChanged();
        }
    }

    private async Task HandleAppChanged(string app)
    {
        if (app == currentApp) return;

        ChartInterop.DestroyAllCharts();
        currentApp = app;
        currentMetrics = GetFilteredMetrics(app);
        selectedPoint = null;
        previousPoint = null;

        // micro-benchmarks needs desktop profile enabled (it's the primary profile for that app)
        if (app == "micro-benchmarks" && checkedValues.TryGetValue("profiles", out var profiles))
        {
            profiles.Add("desktop");
        }

        StateHasChanged();

        await Task.Yield();
        await LoadChartsForCurrentApp();
    }

    private async Task HandleFilterChanged((string Group, string Value, bool Checked) args)
    {
        if (checkedValues.TryGetValue(args.Group, out var set))
        {
            if (args.Checked)
                set.Add(args.Value);
            else
                set.Remove(args.Value);
        }
        var filtersJson = SerializeFilters();
        ChartInterop.ApplyFilters(filtersJson);
        await Task.CompletedTask;
    }

    private async Task HandleShowReleasesChanged(bool show)
    {
        showReleases = show;
        ChartInterop.SetShowReleases(show);
        ChartInterop.DestroyAllCharts();
        selectedPoint = null;
        previousPoint = null;
        StateHasChanged();

        await Task.Yield();
        await LoadChartsForCurrentApp();
    }

    private async Task HandleShowDailyReleasesChanged(bool show)
    {
        showDailyReleases = show;
        ChartInterop.SetShowDailyReleases(show);
        ChartInterop.DestroyAllCharts();
        selectedPoint = null;
        previousPoint = null;
        StateHasChanged();

        await Task.Yield();
        await LoadChartsForCurrentApp();
    }

    private void OnChartPointClick(string detailJson)
    {
        _ = InvokeAsync(async () =>
        {
            try
            {
                var detail = JsonSerializer.Deserialize<JsonElement>(detailJson);
                var bucket = detail.GetProperty("bucket").GetString() ?? "";
                var colIndex = detail.GetProperty("colIndex").GetInt32();
                var rowKey = detail.GetProperty("rowKey").GetString() ?? "";

                var colJson = ChartInterop.GetColumnMetadata(bucket, colIndex);
                var column = JsonSerializer.Deserialize<ColumnInfo>(colJson) ?? new();

                var metricsJson = await ChartInterop.GetPointMetrics(currentApp, bucket, rowKey, colIndex);
                var metricsDict = JsonSerializer.Deserialize<Dictionary<string, double>>(metricsJson);

                var point = new SelectedPointInfo
                {
                    Bucket = bucket,
                    ColIndex = colIndex,
                    RowKey = rowKey,
                    Column = column,
                    Metrics = metricsDict ?? new(),
                };

                // FIFO: push current to previous, set new as current
                // Also override previous point's rowKey to match the new one
                if (selectedPoint != null)
                {
                    previousPoint = selectedPoint;
                    previousPoint.RowKey = rowKey;
                    // Re-fetch metrics for previous point with the new rowKey
                    var prevMetricsJson = await ChartInterop.GetPointMetrics(
                        currentApp, previousPoint.Bucket, rowKey, previousPoint.ColIndex);
                    var prevMetrics = JsonSerializer.Deserialize<Dictionary<string, double>>(prevMetricsJson);
                    previousPoint.Metrics = prevMetrics ?? new();
                }

                selectedPoint = point;
                StateHasChanged();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Point click error: {ex.Message}");
            }
        });
    }

    private async Task LoadChartsForCurrentApp()
    {
        try
        {
            var filtersJson = SerializeFilters();
            await ChartInterop.LoadAppCharts(currentApp, filtersJson);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Chart load error: {ex.Message}");
        }
    }

    private string SerializeFilters()
    {
        return JsonSerializer.Serialize(checkedValues.ToDictionary(
            kv => kv.Key,
            kv => kv.Value.ToList()
        ));
    }

    private List<string> GetFilteredMetrics(string app)
    {
        var metrics = viewIndex?.Metrics.TryGetValue(app, out var m) == true ? m : new();
        if (app == "micro-benchmarks")
            metrics = metrics.Where(k => !DashboardConfig.MicrobenchSkipMetrics.Contains(k)).ToList();
        // Sort by preferred order
        metrics.Sort((a, b) =>
        {
            var ia = DashboardConfig.MetricOrder.IndexOf(a);
            var ib = DashboardConfig.MetricOrder.IndexOf(b);
            if (ia < 0) ia = int.MaxValue;
            if (ib < 0) ib = int.MaxValue;
            return ia.CompareTo(ib);
        });
        return metrics;
    }

    private void ClearSelection()
    {
        selectedPoint = null;
        previousPoint = null;
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            ChartInterop.DestroyAllCharts();
        }
        catch
        {
            // Ignore during dispose
        }
    }
}
