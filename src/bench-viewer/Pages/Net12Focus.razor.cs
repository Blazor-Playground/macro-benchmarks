using System.Globalization;
using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using System.Text.Json;
using BenchViewer.Interop;
using BenchViewer.Models;
using Microsoft.AspNetCore.Components;

namespace BenchViewer.Pages;

[SupportedOSPlatform("browser")]
public partial class Net12Focus
{
    [Inject] private NavigationManager Navigation { get; set; } = default!;

    private static readonly (string Value, string Label)[] Ranges =
        [("14d", "14 days"), ("1m", "1 month"), ("3m", "3 months"), ("6m", "6 months"), ("12m", "12 months")];
    private string owner = "";
    private string app = "havit-bootstrap";
    private string range = "14d";
    private string flavor = "";
    private string startupProfile = "";
    private FocusConfiguration? configuration;
    private bool averaged;
    private bool showBands = true;
    private bool showPercentage;
    private bool showMeasurements;
    private bool loading = true;
    private bool renderCharts;
    private bool disposed;
    private long generation;
    private string? error;
    private List<string> apps = new();
    private FocusReport? report;

    private IReadOnlyList<FocusMetricReport> CurrentMetrics => report?.Metrics ?? FocusMetricReport.Placeholders;
    private FocusFlavorOption? SelectedFlavor => configuration?.Flavors.FirstOrDefault(option => option.Id == flavor);
    private string StartupProfileLabel => startupProfile == "mobile" ? "Mobile" : startupProfile == "desktop" ? "Desktop" : "Loading";
    private bool GraphsEnabled => showPercentage || showMeasurements;

    private sealed record LatestBuild(FocusObservation Observation, int? AgeDays, List<string> MetricTitles);

    private IReadOnlyList<LatestBuild> LatestBuilds
    {
        get
        {
            var builds = new Dictionary<string, LatestBuild>(StringComparer.Ordinal);
            foreach (var metric in CurrentMetrics)
            {
                if (metric.Latest is not { } latest) continue;
                if (!builds.TryGetValue(latest.Observation.Id, out var build))
                {
                    build = new LatestBuild(latest.Observation, metric.AgeDays, new());
                    builds.Add(latest.Observation.Id, build);
                }
                build.MetricTitles.Add(metric.Title);
            }
            return builds.Values.ToList();
        }
    }

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (disposed) return;
        if (firstRender)
        {
            try
            {
                Initialize();
                await Load(false);
            }
            catch (JSException exception)
            {
                ShowError(exception);
                StateHasChanged();
            }
            catch (JsonException exception)
            {
                ShowError(exception);
                StateHasChanged();
            }
            return;
        }
        if (renderCharts && report != null && !loading && error == null)
        {
            renderCharts = false;
            try
            {
                FocusInterop.Render(owner, averaged, showBands, showPercentage, showMeasurements);
            }
            catch (JSException exception)
            {
                ShowError(exception);
                StateHasChanged();
            }
        }
    }

    private async Task Load(bool force)
    {
        var request = ++generation;
        loading = true;
        error = null;
        report = null;
        renderCharts = false;
        StateHasChanged();
        try
        {
            var json = await FocusInterop.Load(owner, app, range, flavor, startupProfile, force);
            if (disposed || request != generation) return;
            var result = JsonSerializer.Deserialize(json, FocusJsonContext.Default.FocusLoadResult)
                ?? throw new JsonException("The focus response was empty.");
            if (result.Status == "cancelled") return;
            if (result.Status != "ready" || result.Report == null || result.Report.Metrics.Count != 4)
                throw new JsonException("The focus response did not contain the four expected metrics.");
            if (result.Report.Flavor != flavor || result.Report.StartupProfile != startupProfile)
                throw new JsonException("The focus response did not match the selected comparison.");
            report = result.Report;
            apps = report.Apps.OrderBy(id =>
            {
                var index = DashboardConfig.AppOrder.IndexOf(id);
                return index < 0 ? int.MaxValue : index;
            }).ThenBy(id => id, StringComparer.Ordinal).ToList();
            loading = false;
            renderCharts = true;
        }
        catch (JSException exception)
        {
            if (!disposed && request == generation) ShowError(exception);
        }
        catch (JsonException exception)
        {
            if (!disposed && request == generation) ShowError(exception);
        }
        if (!disposed && request == generation) StateHasChanged();
    }

    private void ShowError(Exception exception)
    {
        Console.Error.WriteLine($"NET12 focus: {exception}");
        error = exception.Message;
        loading = false;
        renderCharts = false;
    }

    private async Task ChangeApp(ChangeEventArgs args)
    {
        var selected = args.Value?.ToString();
        if (string.IsNullOrEmpty(selected) || selected == app) return;
        app = selected;
        await Load(false);
    }

    private async Task ChangeRange(string selected)
    {
        if (selected == range) return;
        range = selected;
        await Load(false);
    }

    private void Initialize()
    {
        configuration = JsonSerializer.Deserialize(FocusInterop.Configuration(), FocusJsonContext.Default.FocusConfiguration)
            ?? throw new JsonException("The focus configuration was empty.");
        if (!configuration.Flavors.Any(option => option.Id == configuration.DefaultFlavor)
            || configuration.DefaultStartupProfile is not ("mobile" or "desktop"))
            throw new JsonException("The focus defaults are not valid comparison choices.");
        flavor = configuration.DefaultFlavor;
        startupProfile = configuration.DefaultStartupProfile;
        showPercentage = configuration.DefaultGraphVisibility.Percentage;
        showMeasurements = configuration.DefaultGraphVisibility.Measurements;
        averaged = configuration.DefaultAveraged;
        owner = FocusInterop.Create(Navigation.BaseUri);
    }

    private async Task ChangeFlavor(ChangeEventArgs args)
    {
        var selected = args.Value?.ToString();
        if (selected == flavor) return;
        var option = configuration?.Flavors.FirstOrDefault(option => option.Id == selected);
        if (option == null)
        {
            ShowError(new ArgumentException("Select one of the supported comparison flavors."));
            return;
        }
        flavor = option.Id;
        await Load(false);
    }

    private async Task ChangeStartupProfile(ChangeEventArgs args)
    {
        var selected = args.Value?.ToString();
        if (selected == startupProfile) return;
        if (selected is not ("mobile" or "desktop"))
        {
            ShowError(new ArgumentException("Select Desktop or Mobile for startup."));
            return;
        }
        startupProfile = selected;
        await Load(false);
    }

    private void SetAverage(bool value)
    {
        averaged = value;
        renderCharts = report != null && error == null;
    }

    private void ChangeBands(ChangeEventArgs args)
    {
        showBands = args.Value is true;
        renderCharts = report != null && error == null;
    }

    private void ChangePercentage(ChangeEventArgs args)
    {
        showPercentage = args.Value is true;
        renderCharts = report != null && error == null;
    }

    private void ChangeMeasurements(ChangeEventArgs args)
    {
        showMeasurements = args.Value is true;
        renderCharts = report != null && error == null;
    }

    private async Task Retry()
    {
        if (owner.Length == 0)
        {
            try { Initialize(); }
            catch (JSException exception) { ShowError(exception); return; }
            catch (JsonException exception) { ShowError(exception); return; }
        }
        await Load(true);
    }

    private static string AppName(string id) => id == "havit-bootstrap" ? "Blazor Havit" : DashboardConfig.AppName(id);
    private static string RefreshTime(string value) => DateTimeOffset.Parse(value, CultureInfo.InvariantCulture).UtcDateTime.ToString("yyyy-MM-dd HH:mm 'UTC'", CultureInfo.InvariantCulture);

    public ValueTask DisposeAsync()
    {
        disposed = true;
        generation++;
        if (owner.Length > 0)
        {
            try
            {
                FocusInterop.Dispose(owner);
            }
            catch (JSException exception)
            {
                Console.Error.WriteLine($"NET12 focus disposal: {exception}");
            }
        }
        return ValueTask.CompletedTask;
    }
}
