using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using AvaloniaBench.Interop;

namespace AvaloniaBench;

/// <summary>
/// Code-only application (no XAML, no theme) to keep the startup path minimal.
/// </summary>
public sealed class App : Application
{
    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is ISingleViewApplicationLifetime singleView)
        {
            var host = new BenchHost();
            BenchHost.Current = host;
            host.AttachedToVisualTree += OnHostAttached;
            singleView.MainView = host;
        }

        base.OnFrameworkInitializationCompleted();

        BenchInterop.SetManagedReady();
    }

    private static async void OnHostAttached(object? sender, VisualTreeAttachmentEventArgs e)
    {
        var host = (BenchHost)sender!;
        host.AttachedToVisualTree -= OnHostAttached;

        // The second animation-frame callback only runs once the first frame has been presented.
        await host.WaitForFramesAsync(2);
        BenchInterop.SetFirstFrameRendered();
    }
}
