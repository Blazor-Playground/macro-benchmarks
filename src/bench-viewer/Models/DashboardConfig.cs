namespace BenchViewer.Models;

public static class DashboardConfig
{
    // GitHub repository (owner/name) — injected from MSBuild property at build time
    public static string GitHubRepo => BuildConfig.GitHubRepo;
    public static string GitHubUrl => $"https://github.com/{GitHubRepo}";
    public static string GitHubPagesUrl => $"https://{GitHubRepo.Split('/')[0]}.github.io/{GitHubRepo.Split('/')[1]}";

    // Metrics to skip for all apps
    public static readonly HashSet<string> SkipMetrics = new()
    {
        "semi-walkthrough"
    };

    // Metrics to skip for micro-benchmarks (build/disk not meaningful)
    public static readonly HashSet<string> MicrobenchSkipMetrics = new()
    {
        "compile-time", "disk-size-native", "disk-size-assemblies",
        "download-size-cold", "download-size-warm",
        "server-requests-cold", "server-requests-warm"
    };

    // Preferred app display order
    public static readonly List<string> AppOrder = new()
    {
        "blazing-pizza", "havit-bootstrap", "mud-blazor", "igniteui-light", "blazor-perf", "empty-blazor",
        "semi-avalonia", "uno-gallery",
        "empty-browser", "empty-browser",
        "micro-benchmarks",
        "bench-viewer", 
    };

    // Preferred metric display order
    public static readonly List<string> MetricOrder = new()
    {
        "pizza-walkthrough", "havit-walkthrough", "mud-walkthrough", "igniteui-walkthrough", "semi-walkthrough", "uno-walkthrough",
        "blazor-counter-heavy-wasm", "blazor-counter-heavy-server", "blazor-virtualscroll-heavy-wasm", "blazor-virtualscroll-heavy-server",
        "blazor-js-to-cs-number", "blazor-js-to-cs-string", "blazor-js-to-cs-json",
        "blazor-cs-to-js-number", "blazor-cs-to-js-string", "blazor-cs-to-js-json",
        "json-parse-ops", "js-interop-ops", "exception-ops",
        "time-to-reach-managed-cold", "time-to-reach-managed-warm",
        "time-to-create-dotnet-cold", "time-to-create-dotnet-warm",
        "download-size-cold", "download-size-warm",
        "server-requests-cold", "server-requests-warm",
        "disk-size-native", "disk-size-assemblies",
        "wasm-memory-size", "memory-peak", "compile-time",
        "time-to-exit-cold", "time-to-exit-warm",
    };

    // Apps that are Blazor-based (cannot run in v8/node CLI engines)
    public static readonly HashSet<string> BlazorApps = new()
    {
        "empty-blazor", "blazing-pizza", "havit-bootstrap", "bench-viewer", "mud-blazor", "igniteui-light", "blazor-perf"
    };
}
