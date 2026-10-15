using System.Globalization;
using System.Text.Json.Serialization;

namespace BenchViewer.Models;

public sealed class DebugLoadResult
{
    public string Status { get; init; } = "";
    public DebugReport? Report { get; init; }
}

public sealed class DebugReport
{
    public string App { get; init; } = "";
    public List<string> Apps { get; init; } = new();
    public string Range { get; init; } = "";
    public string StartDay { get; init; } = "";
    public string EndDay { get; init; } = "";
    public string LastUpdated { get; init; } = "";
    public string? RawDataPath { get; init; }
    public string Cohort { get; init; } = "";
    public List<DebugCohort> Cohorts { get; init; } = new();
    public List<DebugMetricReport> Metrics { get; init; } = new();
}

public sealed class DebugCohort
{
    public string Id { get; init; } = "";
    public string Label { get; init; } = "";
}

public class DebugMeasurement
{
    public string Status { get; init; } = "";
    public string Reason { get; init; } = "";
    public int Requested { get; init; }
    public int Successful { get; init; }
    public double? ValueMs { get; init; }
    public string Aggregation { get; init; } = "";
    public Dictionary<string, string> Properties { get; init; } = new();
}

public sealed class DebugMetricReport
{
    public string Id { get; init; } = "";
    public string Key { get; init; } = "";
    public string Title { get; init; } = "";
    public string Boundary { get; init; } = "";
    public string Description { get; init; } = "";
    public string Status { get; init; } = "";
    public string Message { get; init; } = "";
    public string Unit { get; init; } = "";
    public double Divisor { get; init; } = 1;
    public FocusComparison? Comparison { get; init; }
    public DebugMeasurement? Mono { get; init; }
    public DebugMeasurement? Coreclr { get; init; }
    public DebugMeasurement? BuildMono { get; init; }
    public DebugMeasurement? BuildCoreclr { get; init; }
    public string? Sdk { get; init; }
    public string? Day { get; init; }
    public string? MeasuredAt { get; init; }
    public bool OlderPair { get; init; }
    public bool Smoke { get; init; }
    public bool Controlled { get; init; }
    public bool LocalPaired { get; init; }
    public List<DebugPoint> Points { get; init; } = new();
    public string Format(double? value) => value is null ? "Not available"
        : $"{(value.Value / Divisor).ToString(Unit == "ms" ? "N1" : "N2", CultureInfo.InvariantCulture)} {Unit}";
}

public sealed class DebugPoint
{
    public double? Mono { get; init; }
    public double? Coreclr { get; init; }
    public double? Percent { get; init; }
}

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(DebugLoadResult))]
internal partial class DebugJsonContext : JsonSerializerContext;
