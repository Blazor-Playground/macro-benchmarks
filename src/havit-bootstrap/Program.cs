using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using System.Globalization;
using Havit.Blazor.Documentation.DemoData;
using Havit.Blazor.Documentation.Services;
using Havit.Blazor.Documentation.Shared.Components;
using Havit.Blazor.Documentation.Shared.Components.DocColorMode;
using Havit.Blazor.Documentation.Pages.Showcase.Data;

namespace Havit.Blazor.Documentation;

public class Program
{
	public static async Task Main(string[] args)
	{
		var builder = WebAssemblyHostBuilder.CreateDefault(args);

		var cultureInfo = new CultureInfo("en-US");
		CultureInfo.DefaultThreadCurrentCulture = cultureInfo;
		CultureInfo.DefaultThreadCurrentUICulture = cultureInfo;

		builder.RootComponents.Add<Havit.Blazor.Documentation.App>("#app");

		builder.Services.AddHxServices();
		builder.Services.AddHxMessenger();
		builder.Services.AddHxMessageBoxHost();

		builder.Services.AddSingleton<IShowcaseDataService, ShowcaseDataService>();

		builder.Services.AddScoped<IDocColorModeProvider, DocColorModeProvider>();
		builder.Services.AddCascadingValue<ColorMode>(services =>
		{
			var docColorModeStateProvider = services.GetRequiredService<IDocColorModeProvider>();
			return new DocColorModeCascadingValueSource(docColorModeStateProvider);
		});

		builder.Services.AddTransient<IDemoDataService, DemoDataService>();

		builder.Services.AddSingleton<IDocPageNavigationItemsTracker, DocPageNavigationItemsTracker>();
		builder.Services.AddScoped<DocHeadContentTracker>();

		builder.Services.AddSingleton<IApiDocModelBuilder, ApiDocModelBuilder>();
		builder.Services.AddSingleton<IApiDocModelProvider, ApiDocModelProvider>();

		await builder.Build().RunAsync();
	}
}
