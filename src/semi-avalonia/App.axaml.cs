using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Data.Core.Plugins;
using Avalonia.Markup.Xaml;
using Semi.Avalonia.Demo.ViewModels;
using Semi.Avalonia.Demo.Views;

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
    }
}
