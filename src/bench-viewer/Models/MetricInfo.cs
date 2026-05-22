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
        ["wasm-memory-size"] = new("wasm-memory-size", "WASM Memory Size", "bytes", "memory"),
        ["memory-peak"] = new("memory-peak", "Peak JS Heap", "bytes", "memory"),
        ["pizza-walkthrough"] = new("pizza-walkthrough", "Blazing Pizza Walkthrough", "ms", "time"),
        ["havit-walkthrough"] = new("havit-walkthrough", "Havit Bootstrap Walkthrough", "ms", "time"),
        ["mud-walkthrough"] = new("mud-walkthrough", "MudBlazor Walkthrough", "ms", "time"),
        ["igniteui-walkthrough"] = new("igniteui-walkthrough", "Ignite UI Walkthrough", "ms", "time"),
        ["semi-walkthrough"] = new("semi-walkthrough", "Semi Avalonia Walkthrough", "ms", "time"),
        ["js-interop-ops"] = new("js-interop-ops", "JS Interop", "ops/sec", "throughput"),
        ["json-parse-ops"] = new("json-parse-ops", "JSON Parse", "ops/sec", "throughput"),
        ["exception-ops"] = new("exception-ops", "Exception Handling", "ops/sec", "throughput"),
        ["blazor-js-to-cs-number"] = new("blazor-js-to-cs-number", "Blazor JS→CS Number", "ops/sec", "throughput"),
        ["blazor-js-to-cs-string"] = new("blazor-js-to-cs-string", "Blazor JS→CS String", "ops/sec", "throughput"),
        ["blazor-js-to-cs-json"] = new("blazor-js-to-cs-json", "Blazor JS→CS JSON", "ops/sec", "throughput"),
        ["blazor-cs-to-js-number"] = new("blazor-cs-to-js-number", "Blazor CS→JS Number", "ops/sec", "throughput"),
        ["blazor-cs-to-js-string"] = new("blazor-cs-to-js-string", "Blazor CS→JS String", "ops/sec", "throughput"),
        ["blazor-cs-to-js-json"] = new("blazor-cs-to-js-json", "Blazor CS→JS JSON", "ops/sec", "throughput"),
        ["blazor-counter-heavy-wasm"] = new("blazor-counter-heavy-wasm", "Counter Heavy (WASM)", "ops/sec", "throughput"),
        ["blazor-counter-heavy-server"] = new("blazor-counter-heavy-server", "Counter Heavy (Server)", "ops/sec", "throughput"),
        ["blazor-params-count-wasm"] = new("blazor-params-count-wasm", "Params Count (WASM)", "ops/sec", "throughput"),
        ["blazor-params-count-server"] = new("blazor-params-count-server", "Params Count (Server)", "ops/sec", "throughput"),
        ["blazor-params-count-ssr"] = new("blazor-params-count-ssr", "Params Count (SSR)", "ops/sec", "throughput"),
        ["blazor-params-count-htmlrenderer"] = new("blazor-params-count-htmlrenderer", "Params Count (HtmlRenderer)", "ops/sec", "throughput"),
        ["blazor-params-count-ssr-stress"] = new("blazor-params-count-ssr-stress", "Params Count (SSR ×100)", "ops/sec", "throughput"),
        ["blazor-params-count-htmlrenderer-stress"] = new("blazor-params-count-htmlrenderer-stress", "Params Count (HtmlRenderer ×10)", "ops/sec", "throughput"),
        ["blazor-params-count-server-stress"] = new("blazor-params-count-server-stress", "Params Count (Server ×25)", "ops/sec", "throughput"),
        ["blazor-too-many-components-wasm"] = new("blazor-too-many-components-wasm", "Many Components (WASM)", "ops/sec", "throughput"),
        ["blazor-too-many-components-server"] = new("blazor-too-many-components-server", "Many Components (Server)", "ops/sec", "throughput"),
        ["blazor-too-many-components-ssr"] = new("blazor-too-many-components-ssr", "Many Components (SSR)", "ops/sec", "throughput"),
        ["blazor-too-many-components-htmlrenderer"] = new("blazor-too-many-components-htmlrenderer", "Many Components (HtmlRenderer)", "ops/sec", "throughput"),
        ["blazor-too-many-components-ssr-stress"] = new("blazor-too-many-components-ssr-stress", "Many Components (SSR ×100)", "ops/sec", "throughput"),
        ["blazor-too-many-components-htmlrenderer-stress"] = new("blazor-too-many-components-htmlrenderer-stress", "Many Components (HtmlRenderer ×10)", "ops/sec", "throughput"),
        ["blazor-too-many-components-server-stress"] = new("blazor-too-many-components-server-stress", "Many Components (Server ×25)", "ops/sec", "throughput"),
        ["time-to-exit-warm"] = new("time-to-exit-warm", "Time to Exit (Warm)", "ms", "time"),
        ["time-to-exit-cold"] = new("time-to-exit-cold", "Time to Exit (Cold)", "ms", "time"),
    };

    // OTEL counter short-names to display names (used for dynamic -otel- suffix metrics)
    private static readonly Dictionary<string, (string Display, string Unit)> OtelCounters = new()
    {
        ["gc-gen0"] = ("GC Gen0", "count"),
        ["gc-gen1"] = ("GC Gen1", "count"),
        ["gc-gen2"] = ("GC Gen2", "count"),
        ["gc-pause-pct"] = ("GC Pause %", "%"),
        ["alloc-rate"] = ("Alloc Rate", "MB/s"),
        ["heap-mb"] = ("Heap Size", "MB"),
        ["lock-contentions"] = ("Lock Contentions", "count"),
        ["threadpool-threads"] = ("ThreadPool Threads", "count"),
        ["threadpool-queue"] = ("ThreadPool Queue", "count"),
        ["cpu-pct"] = ("CPU Usage", "%"),
        ["working-set-mb"] = ("Working Set", "MB"),
    };

    public static string GetDisplay(string key)
    {
        if (All.TryGetValue(key, out var info))
            return info.DisplayName;

        // Dynamic OTEL metrics: "{stress-metric}-otel-{counter}" → "{StressDisplay} · {CounterDisplay}"
        var otelIdx = key.IndexOf("-otel-", StringComparison.Ordinal);
        if (otelIdx > 0)
        {
            var baseKey = key[..otelIdx];
            var counterKey = key[(otelIdx + 6)..];
            var baseDisplay = All.TryGetValue(baseKey, out var baseInfo) ? baseInfo.DisplayName : baseKey;
            var counterDisplay = OtelCounters.TryGetValue(counterKey, out var c) ? c.Display : counterKey;
            return $"{baseDisplay} · {counterDisplay}";
        }

        return key;
    }

    public static string GetUnit(string key)
    {
        if (All.TryGetValue(key, out var info))
            return info.Unit;

        var otelIdx = key.IndexOf("-otel-", StringComparison.Ordinal);
        if (otelIdx > 0)
        {
            var counterKey = key[(otelIdx + 6)..];
            return OtelCounters.TryGetValue(counterKey, out var c) ? c.Unit : "";
        }
        return "";
    }

    public static string FormatValue(string key, double value)
    {
        if (!All.TryGetValue(key, out var info))
        {
            // Handle OTEL metrics formatting
            var otelIdx = key.IndexOf("-otel-", StringComparison.Ordinal);
            if (otelIdx > 0)
            {
                var counterKey = key[(otelIdx + 6)..];
                if (OtelCounters.TryGetValue(counterKey, out var c))
                {
                    return c.Unit switch
                    {
                        "%" => $"{value:N1}%",
                        "MB" => $"{value:N1} MB",
                        "MB/s" => $"{value:N1} MB/s",
                        "count" => $"{value:N0}",
                        _ => value.ToString("N2"),
                    };
                }
            }
            return value.ToString("N2");
        }

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
