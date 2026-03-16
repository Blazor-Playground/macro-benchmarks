using Microsoft.JSInterop;

namespace Havit.Blazor.Documentation.Shared.Components.DocColorMode;

/// <summary>
/// Provides switcher for color mode (theme).
/// </summary>
/// <remarks>
/// The current mode is persisted in a "ColorMode" cookie.
/// The cookie is used for server prerendering (see DocColorModeServerResolver).
/// The server-prerendering value is passed to WASM client by PersistentComponentState.
/// The client-side component uses JS to switch the color mode and save the new value to the cookie.
/// The auto mode is resolved by color-mode-auto.js startup script (see _Layout.cshtml).
/// </remarks>
public partial class DocColorModeSwitcher
{
	[Inject] private IDocColorModeProvider _docColorModeProvider { get; set; }
	[Inject] private IJSRuntime _jsRuntime { get; set; }

	[CascadingParameter] protected ColorMode ColorMode { get; set; }

	private IJSObjectReference _jsModule;

	private async Task HandleClick()
	{
		ColorMode = ColorMode switch
		{
			ColorMode.Auto => ColorMode.Dark,
			ColorMode.Dark => ColorMode.Light,
			ColorMode.Light => ColorMode.Auto,
			_ => ColorMode.Auto // fallback
		};

		await EnsureJsModule();
		await _jsModule.InvokeVoidAsync("setColorMode", ColorMode.ToString("g").ToLowerInvariant());

		_docColorModeProvider.SetColorMode(ColorMode);
	}

	private async Task EnsureJsModule()
	{
		_jsModule ??= await _jsRuntime.InvokeAsync<IJSObjectReference>("import", "./Shared/Components/DocColorMode/DocColorModeSwitcher.razor.js");
	}

	private IconBase GetIcon()
	{
		return ColorMode switch
		{
			ColorMode.Auto => BootstrapIcon.CircleHalf,
			ColorMode.Light => BootstrapIcon.Sun,
			ColorMode.Dark => BootstrapIcon.Moon,
			_ => throw new InvalidOperationException($"Unknown color mode '{ColorMode}'.")
		};
	}

	private string GetTooltip()
	{
		return ColorMode switch
		{
			ColorMode.Auto => "Auto color mode (theme). Click to switch to Dark.",
			ColorMode.Dark => "Dark color mode (theme). Click to switch to Light.",
			ColorMode.Light => "Light color mode (theme). Click to switch to Auto.",
			_ => "Click to switch color mode (theme) to Auto." // fallback
		};
	}
}
