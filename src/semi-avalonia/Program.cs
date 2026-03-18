using System;
using System.Runtime.Versioning;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Browser;
using Semi.Avalonia.Demo;
using System.Runtime.InteropServices.JavaScript;

[assembly: SupportedOSPlatform("browser")]

namespace Semi.Avalonia.Demo.Web;

internal sealed partial class Program
{
    private static Task Main(string[] args)
    {
        Console.WriteLine("Hello, Browser!");
        SetManagedReady();

        return BuildAvaloniaApp()
            .StartBrowserAppAsync("out");
    }

    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>();

    [JSImport("bench.setManagedReady", "main.mjs")]
    internal static partial void SetManagedReady();
}
