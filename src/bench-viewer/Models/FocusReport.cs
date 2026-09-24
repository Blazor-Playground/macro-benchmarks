using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace BenchViewer.Models;

public sealed class FocusLoadResult
{
    public string Status { get; init; } = "";
    public FocusReport? Report { get; init; }
}

public sealed class FocusReport
{
    public string App { get; init; } = "";
    public List<string> Apps { get; init; } = new();
    public string Range { get; init; } = "";
    public string Flavor { get; init; } = "";
    public string FlavorLabel { get; init; } = "";
    public string StartupProfile { get; init; } = "";
    public string StartDay { get; init; } = "";
    public string EndDay { get; init; } = "";
    public string LastUpdated { get; init; } = "";
    public List<string> TargetFrameworks { get; init; } = new();
    public string? AvailableStartDay { get; init; }
    public string? AvailableEndDay { get; init; }
    public int ExcludedCustomBuilds { get; init; }
    public List<FocusMetricReport> Metrics { get; init; } = new();
}

public sealed class FocusMetricReport
{
    public string Id { get; init; } = "";
    public string Title { get; init; } = "";
    public string? Key { get; init; }
    public string Unit { get; init; } = "";
    public double Divisor { get; init; } = 1;
    public string Description { get; init; } = "";
    public string Profile { get; init; } = "";
    public string CoreclrPreset { get; init; } = "";
    public string MonoPreset { get; init; } = "";
    public string CoreclrLabel { get; init; } = "";
    public string MonoLabel { get; init; } = "";
    public string CoreclrRowKey { get; init; } = "";
    public string MonoRowKey { get; init; } = "";
    public string Status { get; init; } = "";
    public string Message { get; init; } = "";
    public List<FocusPoint> Points { get; init; } = new();
    public FocusPoint? Latest { get; init; }
    public FocusComparison? Comparison { get; init; }
    public FocusComparison? AverageComparison { get; init; }
    public bool HasNewerIncomplete { get; init; }
    public int PairCount { get; init; }
    public int? AgeDays { get; init; }

    [JsonIgnore]
    public bool HasSeries => Points.Any(point => point.Coreclr is > 0 || point.Mono is > 0);

    public string FormatValue(double? value) => value is null
        ? "Not available"
        : $"{(value.Value / Divisor).ToString(Unit == "ms" ? "#,0.#" : "0.00", CultureInfo.InvariantCulture)} {Unit}";

    public static IReadOnlyList<FocusMetricReport> Placeholders { get; } =
    [
        new() { Id = "startup", Title = "Cold startup" },
        new() { Id = "walkthrough", Title = "Walkthrough" },
        new() { Id = "download", Title = "Cold download size" },
        new() { Id = "build", Title = "Build time" },
    ];
}

public sealed class FocusComparison
{
    public double Value { get; init; }
    public string Magnitude { get; init; } = "";
    public string Verdict { get; init; } = "";
    public string Tone { get; init; } = "";
}

public sealed class FocusConfiguration
{
    public string DefaultFlavor { get; init; } = "";
    public string DefaultStartupProfile { get; init; } = "";
    public FocusGraphVisibility DefaultGraphVisibility { get; init; } = new();
    public bool DefaultAveraged { get; init; }
    public List<FocusFlavorOption> Flavors { get; init; } = new();
}

public sealed class FocusGraphVisibility
{
    public bool Percentage { get; init; }
    public bool Measurements { get; init; }
}

public sealed class FocusFlavorOption
{
    public string Id { get; init; } = "";
    public string Label { get; init; } = "";
    public string CoreclrPreset { get; init; } = "";
    public string MonoPreset { get; init; } = "";
    public string CoreclrLabel { get; init; } = "";
    public string MonoLabel { get; init; } = "";
}

public sealed class FocusPoint
{
    public FocusObservation Observation { get; init; } = new();
    public int Position { get; init; }
    public double? Coreclr { get; init; }
    public double? Mono { get; init; }
    public double? Percent { get; init; }
    public string? Issue { get; init; }
    public FocusWindow? CoreclrWindow { get; init; }
    public FocusWindow? MonoWindow { get; init; }
    public FocusWindow? PercentWindow { get; init; }
}

public sealed class FocusWindow
{
    public double Mean { get; init; }
    public double Min { get; init; }
    public double Max { get; init; }
    public int Count { get; init; }
    public string FirstSdk { get; init; } = "";
    public string LastSdk { get; init; } = "";
    public string FirstDay { get; init; } = "";
    public string LastDay { get; init; } = "";
}

public sealed class FocusObservation
{
    public string Id { get; init; } = "";
    public string SdkVersion { get; init; } = "";
    public string Day { get; init; } = "";
    public string Bucket { get; init; } = "";
    public int ColumnIndex { get; init; }
    public Dictionary<string, JsonElement> Variant { get; init; } = new();
}

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(FocusLoadResult))]
[JsonSerializable(typeof(FocusConfiguration))]
internal partial class FocusJsonContext : JsonSerializerContext;
