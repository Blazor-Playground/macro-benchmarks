using System.Net.Http.Json;
using System.Text.Json;
using BenchViewer.Models;
using Microsoft.AspNetCore.Components;

namespace BenchViewer.Pages;

public partial class Delta
{
    [Inject] private HttpClient Http { get; set; } = default!;

    private DeltaIndex? deltaIndex;
    private DeltaReport? report;
    private string selectedFile = "";
    private bool loading = true;
    private bool loadingReport;
    private bool noData;
    private string? reportError;

    private List<DeltaEntry> SignificantEntries => report?.Entries
        .OrderByDescending(e => Math.Abs(e.DeltaPct ?? 0))
        .ToList() ?? new();

    [SupplyParameterFromQuery(Name = "sdk")]
    public string? SdkFilter { get; set; }

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (!firstRender) return;

        try
        {
            var response = await Http.GetAsync("data/views/delta/index.json");

            if (!response.IsSuccessStatusCode)
            {
                noData = true;
                loading = false;
                StateHasChanged();
                return;
            }

            deltaIndex = await response.Content.ReadFromJsonAsync<DeltaIndex>();
            if (deltaIndex == null || deltaIndex.Deltas.Count == 0)
            {
                noData = true;
                loading = false;
                StateHasChanged();
                return;
            }

            // If SDK filter is set, find matching entry
            if (!string.IsNullOrEmpty(SdkFilter))
            {
                var match = deltaIndex.Deltas.FirstOrDefault(d => d.SdkVersion == SdkFilter);
                if (match != null)
                {
                    selectedFile = match.File;
                }
            }

            // Default to first (latest)
            if (string.IsNullOrEmpty(selectedFile))
            {
                selectedFile = deltaIndex.Deltas[0].File;
            }

            loading = false;
            StateHasChanged();

            await LoadReport();
        }
        catch
        {
            noData = true;
            loading = false;
            StateHasChanged();
        }
    }

    private async Task OnSelectChanged(ChangeEventArgs e)
    {
        selectedFile = e.Value?.ToString() ?? "";
        await LoadReport();
    }

    private async Task LoadReport()
    {
        if (string.IsNullOrEmpty(selectedFile)) return;

        loadingReport = true;
        reportError = null;
        report = null;
        StateHasChanged();

        try
        {
            var url = $"data/views/delta/{selectedFile}";
            report = await Http.GetFromJsonAsync<DeltaReport>(url);
            if (report == null)
            {
                reportError = "Report not found.";
            }
        }
        catch
        {
            reportError = "Failed to load delta report.";
        }

        loadingReport = false;
        StateHasChanged();
    }

    private static string FormatDate(string isoDate)
    {
        return SelectedPointInfo.FormatDate(isoDate);
    }

    private static string FormatDelta(double? pct)
    {
        if (pct == null) return "—";
        return pct > 0 ? $"+{pct:F1}%" : $"{pct:F1}%";
    }

    private static string FormatSigma(double? sigma)
    {
        if (sigma == null || double.IsInfinity(sigma.Value)) return "∞σ";
        return $"{sigma.Value:F1}σ";
    }
}
