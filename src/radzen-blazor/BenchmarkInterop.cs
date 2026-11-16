using System.Runtime.InteropServices.JavaScript;

namespace RadzenBlazorDemos;

internal static partial class BenchmarkInterop
{
    [JSImport("bench.setManagedReady", "main.mjs")]
    internal static partial void SetManagedReady();

    [JSImport("bench.setRendered", "main.mjs")]
    internal static partial void SetRendered(string path);
}
