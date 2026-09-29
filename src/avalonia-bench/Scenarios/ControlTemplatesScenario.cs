using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Presenters;
using Avalonia.Controls.Primitives;
using Avalonia.Controls.Templates;
using Avalonia.Data;
using Avalonia.Media;
using Avalonia.Styling;

namespace AvaloniaBench.Scenarios;

/// <summary>
/// Control themes and templates: each iteration adds 40 Buttons using a code-built
/// <see cref="ControlTheme"/> (setters, a Border + ContentPresenter template with template bindings,
/// nested <c>:pointerover</c>/<c>:pressed</c>/<c>:disabled</c> styles) to a WrapPanel, runs a layout
/// pass (applying templates, and the theme's content template to each Button's icon content) and
/// removes them again. The content is an icon rather than a string, so no text is shaped (that is
/// the text-layout scenario). Reports controls per second.
/// </summary>
public sealed class ControlTemplatesScenario : BenchScenario
{
    private const int ControlCount = 40;

    private static readonly Icon[] s_icons =
    [
        new(16, Brushes.SteelBlue), new(24, Brushes.IndianRed), new(32, Brushes.SeaGreen), new(20, Brushes.Goldenrod),
        new(48, Brushes.MediumPurple), new(12, Brushes.DarkOrange), new(28, Brushes.Teal), new(40, Brushes.SlateGray),
    ];

    private static readonly ControlTheme s_buttonTheme = CreateButtonTheme();

    private WrapPanel? _panel;

    public override string Name => "control-templates";

    public override ScenarioKind Kind => ScenarioKind.Managed;

    public override Control CreateView() => _panel = new WrapPanel { Margin = new Thickness(8) };

    public override int RunIteration()
    {
        var children = _panel!.Children;
        for (var i = 0; i < ControlCount; i++)
        {
            children.Add(new Button
            {
                Theme = s_buttonTheme,
                Content = s_icons[i % s_icons.Length],
                IsEnabled = i % 7 != 0,
                Margin = new Thickness(4),
            });
        }
        _panel.UpdateLayout();
        children.Clear();
        return ControlCount;
    }

    public override void Stop() => _panel = null;

    private static ControlTheme CreateButtonTheme() => new(typeof(Button))
    {
        Setters =
        {
            new Setter(TemplatedControl.BackgroundProperty, Brushes.Gainsboro),
            new Setter(TemplatedControl.BorderBrushProperty, Brushes.Gray),
            new Setter(TemplatedControl.BorderThicknessProperty, new Thickness(1)),
            new Setter(TemplatedControl.PaddingProperty, new Thickness(12, 4)),
            new Setter(TemplatedControl.CornerRadiusProperty, new CornerRadius(3)),
            new Setter(ContentControl.ContentTemplateProperty, new FuncDataTemplate<Icon>((icon, _) => new Border
            {
                Width = icon.Width,
                Height = 12,
                CornerRadius = new CornerRadius(2),
                Background = icon.Brush,
            })),
            new Setter(TemplatedControl.TemplateProperty, new FuncControlTemplate<Button>((_, scope) => new Border
            {
                [~Border.BackgroundProperty] = new TemplateBinding(TemplatedControl.BackgroundProperty),
                [~Border.BorderBrushProperty] = new TemplateBinding(TemplatedControl.BorderBrushProperty),
                [~Border.BorderThicknessProperty] = new TemplateBinding(TemplatedControl.BorderThicknessProperty),
                [~Border.CornerRadiusProperty] = new TemplateBinding(TemplatedControl.CornerRadiusProperty),
                Child = new ContentPresenter
                {
                    Name = "PART_ContentPresenter",
                    [~ContentPresenter.ContentProperty] = new TemplateBinding(ContentControl.ContentProperty),
                    [~ContentPresenter.ContentTemplateProperty] = new TemplateBinding(ContentControl.ContentTemplateProperty),
                    [~ContentPresenter.PaddingProperty] = new TemplateBinding(TemplatedControl.PaddingProperty),
                }.RegisterInNameScope(scope),
            })),
        },
        Children =
        {
            new Style(x => x.Nesting().Class(":pointerover"))
            {
                Setters = { new Setter(TemplatedControl.BackgroundProperty, Brushes.Silver) },
            },
            new Style(x => x.Nesting().Class(":pressed"))
            {
                Setters = { new Setter(TemplatedControl.BackgroundProperty, Brushes.DarkGray) },
            },
            new Style(x => x.Nesting().Class(":disabled"))
            {
                Setters = { new Setter(Visual.OpacityProperty, 0.5) },
            },
        },
    };

    private sealed record Icon(double Width, IBrush Brush);
}
