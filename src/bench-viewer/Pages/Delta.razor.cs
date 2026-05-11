using System.Net.Http.Json;
using System.Text.Json;
using BenchViewer.Models;
using Microsoft.AspNetCore.Components;

namespace BenchViewer.Pages;

public partial class Delta
{
    private DeltaIndex? deltaIndex;
    private DeltaReport? report;
    private string selectedFile = "";
    private bool loading = true;
    private bool loadingReport;
    private bool noData;
    private string? reportError;

    private string dataBaseUrl = "";

    private List<DeltaEntry> SignificantEntries => report?.Entries
        .Where(e => e.Significant)
        .OrderByDescending(e => Math.Abs(e.Sigma))
        .ToList() ?? new();

    [SupplyParameterFromQuery(Name = "sdk")]
    public string? SdkFilter { get; set; }

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (!firstRender) return;

        dataBaseUrl = $"{DashboardConfig.GitHubPagesUrl}/data/views";

        try
        {
            using var http = new HttpClient();
            var indexUrl = $"{dataBaseUrl}/delta/index.json";
            var response = await http.GetAsync(indexUrl);

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
            using var http = new HttpClient();
            var url = $"{dataBaseUrl}/delta/{selectedFile}";
            report = await http.GetFromJsonAsync<DeltaReport>(url);
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

    private static string FormatSigma(double sigma)
    {
        if (double.IsInfinity(sigma)) return "∞σ";
        return $"{sigma:F1}σ";
    }
}
