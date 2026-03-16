using System.Text.Json.Serialization;

namespace BenchViewer.Models;

public class ViewHeader
{
    [JsonPropertyName("columns")]
    public List<ColumnInfo> Columns { get; set; } = new();

    [JsonPropertyName("apps")]
    public Dictionary<string, List<string>> Apps { get; set; } = new();

    [JsonPropertyName("week")]
    public string? Week { get; set; }

    [JsonPropertyName("release")]
    public string? Release { get; set; }
}

public class ColumnInfo
{
    [JsonPropertyName("runtimeGitHash")]
    public string RuntimeGitHash { get; set; } = "";

    [JsonPropertyName("runtimeCommitDateTime")]
    public string RuntimeCommitDateTime { get; set; } = "";

    [JsonPropertyName("sdkVersion")]
    public string SdkVersion { get; set; } = "";

    [JsonPropertyName("sdkGitHash")]
    public string? SdkGitHash { get; set; }

    [JsonPropertyName("vmrGitHash")]
    public string? VmrGitHash { get; set; }

    [JsonPropertyName("aspnetCoreGitHash")]
    public string? AspnetCoreGitHash { get; set; }

    [JsonPropertyName("runtimeCommitAuthor")]
    public string? RuntimeCommitAuthor { get; set; }

    [JsonPropertyName("runtimeCommitMessage")]
    public string? RuntimeCommitMessage { get; set; }

    [JsonPropertyName("aspnetCoreCommitDateTime")]
    public string? AspnetCoreCommitDateTime { get; set; }

    [JsonPropertyName("aspnetCoreVersion")]
    public string? AspnetCoreVersion { get; set; }

    [JsonPropertyName("runtimePackVersion")]
    public string? RuntimePackVersion { get; set; }

    [JsonPropertyName("workloadVersion")]
    public string? WorkloadVersion { get; set; }
}
