using System.Runtime.InteropServices.JavaScript;

namespace BenchViewer.Interop;

internal static partial class DebugInterop
{
    private const string ModuleName = "debug-interop.js";
    [JSImport("createDebugSession", ModuleName)]
    internal static partial string Create(string baseUri, bool local);
    [JSImport("loadDebugReport", ModuleName)]
    internal static partial Task<string> Load(string id, string app, string range, string cohort, bool force);
    [JSImport("renderDebugCharts", ModuleName)]
    internal static partial void Render(string id, bool measurements, bool percentage);
    [JSImport("disposeDebugSession", ModuleName)]
    internal static partial void Dispose(string id);
}
