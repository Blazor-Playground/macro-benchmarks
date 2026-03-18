namespace BenchViewer.Models;

public class MetricInfo
{
    public string Key { get; }
    public string DisplayName { get; }
    public string Unit { get; }
    public string Category { get; }

    public MetricInfo(string key, string displayName, string unit, string category)
    {
        Key = key;
        DisplayName = displayName;
        Unit = unit;
        Category = category;
    }

    public static readonly Dictionary<string, MetricInfo> All = new()
    {
        ["compile-time"] = new("compile-time", "Compile Time", "ms", "time"),
        ["disk-size-native"] = new("disk-size-native", "Disk Size (dotnet.native.wasm.br)", "bytes", "size"),
        ["disk-size-assemblies"] = new("disk-size-assemblies", "Disk Size (*.dll.br)", "bytes", "size"),
        ["download-size-cold"] = new("download-size-cold", "Download Size Cold", "bytes", "size"),
        ["download-size-warm"] = new("download-size-warm", "Download Size Warm", "bytes", "size"),
        ["server-requests-cold"] = new("server-requests-cold", "Server Requests Cold", "count", "count"),
        ["server-requests-warm"] = new("server-requests-warm", "Server Requests Warm", "count", "count"),
        ["time-to-reach-managed-warm"] = new("time-to-reach-managed-warm", "Time to Managed (Warm)", "ms", "time"),
        ["time-to-reach-managed-cold"] = new("time-to-reach-managed-cold", "Time to Managed (Cold)", "ms", "time"),
        ["time-to-create-dotnet-warm"] = new("time-to-create-dotnet-warm", "Time to Create Dotnet (Warm)", "ms", "time"),
        ["time-to-create-dotnet-cold"] = new("time-to-create-dotnet-cold", "Time to Create Dotnet (Cold)", "ms", "time"),
        ["time-to-exit-warm"] = new("time-to-exit-warm", "Time to Exit (Warm)", "ms", "time"),
        ["time-to-exit-cold"] = new("time-to-exit-cold", "Time to Exit (Cold)", "ms", "time"),
        ["wasm-memory-size"] = new("wasm-memory-size", "WASM Memory Size", "bytes", "memory"),
        ["memory-peak"] = new("memory-peak", "Peak JS Heap", "bytes", "memory"),
        ["pizza-walkthrough"] = new("pizza-walkthrough", "Blazing Pizza Walkthrough", "ms", "time"),
        ["havit-walkthrough"] = new("havit-walkthrough", "Havit Bootstrap Walkthrough", "ms", "time"),
        ["mud-walkthrough"] = new("mud-walkthrough", "MudBlazor Walkthrough", "ms", "time"),
        ["js-interop-ops"] = new("js-interop-ops", "JS Interop", "ops/sec", "throughput"),
        ["json-parse-ops"] = new("json-parse-ops", "JSON Parse", "ops/sec", "throughput"),
        ["exception-ops"] = new("exception-ops", "Exception Handling", "ops/sec", "throughput"),
    };

    public static string GetDisplay(string key)
    {
        return All.TryGetValue(key, out var info) ? info.DisplayName : key;
    }

    public static string FormatValue(string key, double value)
    {
        if (!All.TryGetValue(key, out var info))
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
}
