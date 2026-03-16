using System.Text.Json;
using System.Runtime.InteropServices.JavaScript;
using BenchViewer.Interop;
using BenchViewer.Models;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace BenchViewer.Pages;

public partial class Home : IAsyncDisposable
{
    [Inject] private IJSRuntime JS { get; set; } = default!;

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

    // Metrics to skip for micro-benchmarks (build/disk not meaningful)
    private static readonly HashSet<string> MicrobenchSkipMetrics = new()
    {
        "compile-time", "disk-size-native", "disk-size-assemblies","download-size-total"
    };

    // Preferred app display order
    private static readonly List<string> AppOrder = new()
    {
        "blazing-pizza", "havit-bootstrap", "mud-blazor", "bench-viewer", "empty-blazor",
        "empty-browser", "micro-benchmarks"
    };

    // Preferred metric display order
    private static readonly List<string> MetricOrder = new()
    {
        "pizza-walkthrough", "havit-walkthrough", "mud-walkthrough",
        "json-parse-ops", "js-interop-ops", "exception-ops",
        "time-to-reach-managed-cold", "time-to-reach-managed-warm",
        "time-to-create-dotnet-cold", "time-to-create-dotnet-warm",
        "time-to-exit-cold", "time-to-exit-warm",
        "download-size-total", "disk-size-native", "disk-size-assemblies",
        "wasm-memory-size", "memory-peak", "compile-time"
    };

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
                var ia = AppOrder.IndexOf(a);
                var ib = AppOrder.IndexOf(b);
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
                var metric = detail.GetProperty("metric").GetString() ?? "";

                // Get column metadata for commit info
                var colJson = ChartInterop.GetColumnMetadata(bucket, colIndex);
                var col = JsonSerializer.Deserialize<JsonElement>(colJson);

                var point = new SelectedPointInfo
                {
                    Bucket = bucket,
                    ColIndex = colIndex,
                    Date = col.TryGetProperty("runtimeCommitDateTime", out var dt)
                        ? FormatDate(dt.GetString() ?? "") : "",
                    SdkVersion = col.TryGetProperty("sdkVersion", out var sdk)
                        ? sdk.GetString() ?? "" : "",
                    RuntimeGitHash = col.TryGetProperty("runtimeGitHash", out var rh)
                        ? rh.GetString() ?? "" : "",
                    SdkGitHash = col.TryGetProperty("sdkGitHash", out var sh)
                        ? sh.GetString() ?? "" : "",
                    VmrGitHash = col.TryGetProperty("vmrGitHash", out var vh)
                        ? vh.GetString() ?? "" : "",
                    AspnetCoreGitHash = col.TryGetProperty("aspnetCoreGitHash", out var ah)
                        ? ah.GetString() ?? "" : "",
                    RuntimeCommitAuthor = col.TryGetProperty("runtimeCommitAuthor", out var ra)
                        ? ra.GetString() ?? "" : "",
                    RuntimeCommitMessage = col.TryGetProperty("runtimeCommitMessage", out var rm)
                        ? rm.GetString() ?? "" : "",
                    AspnetCoreCommitDateTime = col.TryGetProperty("aspnetCoreCommitDateTime", out var acd)
                        ? FormatDate(acd.GetString() ?? "") : "",
                    AspnetCoreVersion = col.TryGetProperty("aspnetCoreVersion", out var av)
                        ? av.GetString() ?? "" : "",
                    RuntimePackVersion = col.TryGetProperty("runtimePackVersion", out var rpv)
                        ? rpv.GetString() ?? "" : "",
                    WorkloadVersion = col.TryGetProperty("workloadVersion", out var wv)
                        ? wv.GetString() ?? "" : "",
                    RowKey = rowKey,
                };

                // Fetch all metrics for this point
                var metricsJson = await ChartInterop.GetPointMetrics(currentApp, bucket, rowKey, colIndex);
                var metricsDict = JsonSerializer.Deserialize<Dictionary<string, double>>(metricsJson);
                point.Metrics = metricsDict ?? new();

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
            metrics = metrics.Where(k => !MicrobenchSkipMetrics.Contains(k)).ToList();
        // Sort by preferred order
        metrics.Sort((a, b) =>
        {
            var ia = MetricOrder.IndexOf(a);
            var ib = MetricOrder.IndexOf(b);
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

    private string FormatDate(string isoDate)
    {
        if (DateTime.TryParse(isoDate, out var dt))
            return dt.ToString("yyyy-MM-dd HH:mm");
        return isoDate;
    }

    private static string Short(string? hash) =>
        string.IsNullOrEmpty(hash) ? "" : hash[..Math.Min(7, hash.Length)];

    private string GetMetricDisplay(string key)
    {
        return MetricInfo.All.TryGetValue(key, out var info) ? info.DisplayName : key;
    }

    private string FormatMetricValue(string key, double value)
    {
        if (!MetricInfo.All.TryGetValue(key, out var info))
            return value.ToString("N2");

        return info.Unit switch
        {
            "bytes" when value >= 1_000_000 => $"{value / 1_048_576:N2} MB",
            "bytes" => $"{value / 1024:N1} KB",
            "ms" when info.Key == "compile-time" => $"{Math.Round(value / 1000)} s",
            "ms" => $"{value:N1} ms",
            "ops/sec" => $"{value:N0} ops/s",
            _ => value.ToString("N2"),
        };
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

    // Model for selected point display
    private class SelectedPointInfo
    {
        public string Bucket { get; set; } = "";
        public int ColIndex { get; set; }
        public string Date { get; set; } = "";
        public string SdkVersion { get; set; } = "";
        public string RuntimeGitHash { get; set; } = "";
        public string SdkGitHash { get; set; } = "";
        public string VmrGitHash { get; set; } = "";
        public string AspnetCoreGitHash { get; set; } = "";
        public string RuntimeCommitAuthor { get; set; } = "";
        public string RuntimeCommitMessage { get; set; } = "";
        public string AspnetCoreCommitDateTime { get; set; } = "";
        public string AspnetCoreVersion { get; set; } = "";
        public string RuntimePackVersion { get; set; } = "";
        public string WorkloadVersion { get; set; } = "";
        public string RowKey { get; set; } = "";
        public Dictionary<string, double> Metrics { get; set; } = new();
    }
}
