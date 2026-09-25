using System.Runtime.InteropServices.JavaScript;

namespace BenchViewer.Interop;

internal static partial class FocusInterop
{
    private const string ModuleName = "focus-interop.js";

    [JSImport("createFocusSession", ModuleName)]
    internal static partial string Create(string baseUri);

    [JSImport("getFocusConfiguration", ModuleName)]
    internal static partial string Configuration();

    [JSImport("loadFocusReport", ModuleName)]
    internal static partial Task<string> Load(string id, string app, string range, string flavor, string startupProfile, bool force);

    [JSImport("renderFocusCharts", ModuleName)]
    internal static partial void Render(string id, bool averaged, bool bands, bool percentage, bool measurements);

    [JSImport("disposeFocusSession", ModuleName)]
    internal static partial void Dispose(string id);
}
