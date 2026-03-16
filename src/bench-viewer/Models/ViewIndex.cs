using System.Text.Json.Serialization;

namespace BenchViewer.Models;

public class ViewIndex
{
    [JsonPropertyName("lastUpdated")]
    public string LastUpdated { get; set; } = "";

    [JsonPropertyName("activeRelease")]
    public string ActiveRelease { get; set; } = "";

    [JsonPropertyName("releases")]
    public List<string> Releases { get; set; } = new();

    [JsonPropertyName("weeks")]
    public List<string> Weeks { get; set; } = new();

    [JsonPropertyName("apps")]
    public List<string> Apps { get; set; } = new();

    [JsonPropertyName("metrics")]
    public Dictionary<string, List<string>> Metrics { get; set; } = new();

    [JsonPropertyName("dimensions")]
    public ViewDimensions Dimensions { get; set; } = new();
}

public class ViewDimensions
{
    [JsonPropertyName("runtimes")]
    public List<string> Runtimes { get; set; } = new();

    [JsonPropertyName("presets")]
    public List<string> Presets { get; set; } = new();

    [JsonPropertyName("profiles")]
    public List<string> Profiles { get; set; } = new();

    [JsonPropertyName("engines")]
    public List<string> Engines { get; set; } = new();
}
