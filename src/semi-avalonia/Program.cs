using System;
using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Browser;
using Semi.Avalonia.Demo;

[assembly: SupportedOSPlatform("browser")]

namespace Semi.Avalonia.Demo.Web;

internal sealed partial class Program
{
    private static Task Main(string[] args)
    {
        Console.WriteLine("Hello, Browser!");

        var options = new BrowserPlatformOptions();

        // Firefox headless (CI) exposes no WebGL — getContext returns null and Skia
        // stalls; force software rendering there. Chrome's swiftshader WebGL is fine.
        if (IsFirefox())
        {
            options.RenderingMode = new[] { BrowserRenderingMode.Software2D };
        }

        return BuildAvaloniaApp()
            .StartBrowserAppAsync("out", options);
    }

    [JSImport("browser.isFirefox", "main.mjs")]
    private static partial bool IsFirefox();

    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>();
}
