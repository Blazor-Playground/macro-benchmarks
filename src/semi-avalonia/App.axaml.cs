using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Data.Core.Plugins;
using Avalonia.Markup.Xaml;
using Semi.Avalonia.Demo.ViewModels;
using Semi.Avalonia.Demo.Views;
using System.Runtime.InteropServices.JavaScript;
using System;
using System.Threading.Tasks;

namespace Semi.Avalonia.Demo;

public partial class App : Application
{
    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
        this.DataContext = new ApplicationViewModel();
    }

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is ISingleViewApplicationLifetime singleView)
        {
            singleView.MainView = new MainView();
        }

        this.RegisterFollowSystemTheme();
        base.OnFrameworkInitializationCompleted();

        SetManagedReady();
    }

    [JSImport("bench.setManagedReady", "main.mjs")]
    internal static partial void SetManagedReady();

    [JSImport("bench.setContentReady", "main.mjs")]
    internal static partial void SetContentReady();

    [JSImport("bench.setFirstFrameRendered", "main.mjs")]
    internal static partial void SetFirstFrameRendered();

    [JSExport]
    internal static Task SelectPaletteForBenchmark()
    {
        if (Current?.ApplicationLifetime is not ISingleViewApplicationLifetime { MainView: MainView view })
        {
            throw new InvalidOperationException("Semi Avalonia's main view is not available.");
        }
        return view.SelectPaletteForBenchmark();
    }
}
