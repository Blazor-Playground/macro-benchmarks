using System.Text.Json.Serialization;

namespace BenchViewer.Models;

public class DeltaIndex
{
    [JsonPropertyName("deltas")]
    public List<DeltaIndexEntry> Deltas { get; set; } = new();
}

public class DeltaIndexEntry
{
    [JsonPropertyName("file")]
    public string File { get; set; } = "";

    [JsonPropertyName("sdkVersion")]
    public string SdkVersion { get; set; } = "";

    [JsonPropertyName("runtimeGitHash")]
    public string RuntimeGitHash { get; set; } = "";

    [JsonPropertyName("benchmarkDateTime")]
    public string BenchmarkDateTime { get; set; } = "";

    [JsonPropertyName("hasSignificant")]
    public bool HasSignificant { get; set; }
}

public class DeltaReport
{
    [JsonPropertyName("meta")]
    public DeltaReportMeta Meta { get; set; } = new();

    [JsonPropertyName("baseline")]
    public DeltaReportBaseline Baseline { get; set; } = new();

    [JsonPropertyName("entries")]
    public List<DeltaEntry> Entries { get; set; } = new();

    [JsonPropertyName("summary")]
    public DeltaSummary Summary { get; set; } = new();
}

public class DeltaReportMeta
{
    [JsonPropertyName("sdkVersion")]
    public string SdkVersion { get; set; } = "";

    [JsonPropertyName("runtimeGitHash")]
    public string RuntimeGitHash { get; set; } = "";

    [JsonPropertyName("aspnetCoreGitHash")]
    public string AspnetCoreGitHash { get; set; } = "";

    [JsonPropertyName("vmrGitHash")]
    public string VmrGitHash { get; set; } = "";

    [JsonPropertyName("runtimeCommitDateTime")]
    public string RuntimeCommitDateTime { get; set; } = "";

    [JsonPropertyName("runtimeCommitMessage")]
    public string RuntimeCommitMessage { get; set; } = "";

    [JsonPropertyName("benchmarkDateTime")]
    public string BenchmarkDateTime { get; set; } = "";

    [JsonPropertyName("ciRunUrl")]
    public string? CiRunUrl { get; set; }
}

public class DeltaReportBaseline
{
    [JsonPropertyName("sdkVersion")]
    public string SdkVersion { get; set; } = "";

    [JsonPropertyName("runtimeGitHash")]
    public string RuntimeGitHash { get; set; } = "";

    [JsonPropertyName("runtimeCommitDateTime")]
    public string RuntimeCommitDateTime { get; set; } = "";

    [JsonPropertyName("runtimeCommitMessage")]
    public string RuntimeCommitMessage { get; set; } = "";

    [JsonPropertyName("benchmarkDateTime")]
    public string BenchmarkDateTime { get; set; } = "";
}

public class DeltaEntry
{
    [JsonPropertyName("app")]
    public string App { get; set; } = "";

    [JsonPropertyName("metric")]
    public string Metric { get; set; } = "";

    [JsonPropertyName("metricType")]
    public string MetricType { get; set; } = "";

    [JsonPropertyName("rowKey")]
    public string RowKey { get; set; } = "";

    [JsonPropertyName("current")]
    public double Current { get; set; }

    [JsonPropertyName("previous")]
    public double Previous { get; set; }

    [JsonPropertyName("deltaPct")]
    public double? DeltaPct { get; set; }

    [JsonPropertyName("rollingMedian")]
    public double RollingMedian { get; set; }

    [JsonPropertyName("rollingMad")]
    public double RollingMad { get; set; }

    [JsonPropertyName("sigma")]
    public double Sigma { get; set; }

    [JsonPropertyName("significant")]
    public bool Significant { get; set; }

    [JsonPropertyName("direction")]
    public string Direction { get; set; } = "neutral";
}

public class DeltaSummary
{
    [JsonPropertyName("total")]
    public int Total { get; set; }

    [JsonPropertyName("significant")]
    public int Significant { get; set; }

    [JsonPropertyName("regressions")]
    public int Regressions { get; set; }

    [JsonPropertyName("improvements")]
    public int Improvements { get; set; }
}
