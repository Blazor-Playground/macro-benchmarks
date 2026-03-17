using System.Runtime.InteropServices.JavaScript;
using System.Threading.Tasks;

namespace BenchViewer.Interop;

public static partial class ChartInterop
{
    private const string ModuleName = "chart-interop.mjs";

    [JSImport("initDashboard", ModuleName)]
    internal static partial Task<string> InitDashboard(string baseUrl);

    [JSImport("loadAppCharts", ModuleName)]
    internal static partial Task<string> LoadAppCharts(string app, string filtersJson);

    [JSImport("applyFilters", ModuleName)]
    internal static partial void ApplyFilters(string filtersJson);

    [JSImport("getColumnMetadata", ModuleName)]
    internal static partial string GetColumnMetadata(string bucket, int colIndex);

    [JSImport("getPointMetrics", ModuleName)]
    internal static partial Task<string> GetPointMetrics(string app, string bucket, string rowKey, int colIndex);

    [JSImport("destroyAllCharts", ModuleName)]
    internal static partial void DestroyAllCharts();

    [JSImport("destroyChart", ModuleName)]
    internal static partial void DestroyChart(string canvasId);

    [JSImport("registerPointClickCallback", ModuleName)]
    internal static partial void RegisterPointClickCallback([JSMarshalAs<JSType.Function<JSType.String>>] Action<string> callback);

    [JSImport("setShowReleases", ModuleName)]
    internal static partial void SetShowReleases(bool show);

    [JSImport("setShowDailyReleases", ModuleName)]
    internal static partial void SetShowDailyReleases(bool show);

    [JSImport("scrollChartsToTop", ModuleName)]
    internal static partial void ScrollChartsToTop();
}
