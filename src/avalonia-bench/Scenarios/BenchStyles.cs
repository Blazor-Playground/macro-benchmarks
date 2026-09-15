using System;
using System.Collections.Generic;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Styling;

namespace AvaloniaBench.Scenarios;

/// <summary>
/// Shared global style set and styled content for the styles scenarios. The rules only set
/// render-affecting properties (Background, Opacity, BorderBrush), so styling cost isn't mixed with layout.
/// </summary>
internal static class BenchStyles
{
    public const int ClassCount = 40;
    public const string HotClass = "hot";
    public const string RowClass = "row";

    private static readonly IBrush[] s_palette =
    [
        Brushes.SteelBlue, Brushes.IndianRed, Brushes.SeaGreen, Brushes.Goldenrod,
        Brushes.MediumPurple, Brushes.Teal, Brushes.Coral,
    ];

    /// <summary>~160 rules: type+class, descendant, child + :nth-child, and :not selectors.</summary>
    public static Styles CreateGlobalStyles()
    {
        var styles = new Styles();
        for (var k = 0; k < ClassCount; k++)
        {
            var cls = ClassName(k);
            var brush = s_palette[k % s_palette.Length];

            styles.Add(new Style(x => x.OfType<Border>().Class(cls))
            {
                Setters = { new Setter(Border.BackgroundProperty, brush) },
            });
            styles.Add(new Style(x => x.OfType<StackPanel>().Class(RowClass).Descendant().OfType<Border>().Class(cls).Class(HotClass))
            {
                Setters = { new Setter(Visual.OpacityProperty, 0.6) },
            });
            styles.Add(new Style(x => x.OfType<StackPanel>().Class(RowClass).Child().OfType<Border>().Class(cls).NthChild(2, 0))
            {
                Setters = { new Setter(Border.BorderBrushProperty, Brushes.Black) },
            });
            styles.Add(new Style(x => x.OfType<Border>().Class(cls).Not(y => y.Class(HotClass)))
            {
                Setters = { new Setter(Border.BorderBrushProperty, brush) },
            });
        }
        return styles;
    }

    public static string ClassName(int index) => "c" + (index % ClassCount);

    /// <summary>
    /// Throws if the global rules don't affect <paramref name="secondInRow"/> (the 2nd Border of a
    /// row), so a styles benchmark can't silently measure unstyled controls.
    /// </summary>
    /// <remarks>
    /// Per class, the :not(.hot) rule is declared after the :nth-child rule and wins while the
    /// element isn't hot, so the black :nth-child BorderBrush is only visible with .hot set.
    /// </remarks>
    public static void EnsureApplied(Border secondInRow)
    {
        if (secondInRow.Background is null)
            throw new InvalidOperationException("Global styles were not applied: type+class rule did not set Background");

        var wasHot = secondInRow.Classes.Contains(HotClass);
        secondInRow.Classes.Set(HotClass, true);
        var (hotOpacity, hotBrush) = (secondInRow.Opacity, secondInRow.BorderBrush);
        secondInRow.Classes.Set(HotClass, false);
        var (coldOpacity, coldBrush) = (secondInRow.Opacity, secondInRow.BorderBrush);
        secondInRow.Classes.Set(HotClass, wasHot);

        if (Math.Abs(hotOpacity - 0.6) > 1e-9 || Math.Abs(coldOpacity - 1) > 1e-9)
            throw new InvalidOperationException(
                $"Global styles were not applied: descendant rule didn't react to class changes (hot={hotOpacity}, cold={coldOpacity})");
        if (!ReferenceEquals(hotBrush, Brushes.Black))
            throw new InvalidOperationException("Global styles were not applied: child + :nth-child rule did not set BorderBrush");
        if (coldBrush is null || ReferenceEquals(coldBrush, Brushes.Black))
            throw new InvalidOperationException("Global styles were not applied: :not(.hot) rule did not override BorderBrush");
    }

    /// <summary>Rows of classed Borders; collects the leaves into <paramref name="leaves"/> if given.</summary>
    public static StackPanel CreateRows(int rows, int columns, int classOffset, List<Border>? leaves = null)
    {
        var root = new StackPanel();
        for (var r = 0; r < rows; r++)
        {
            var row = new StackPanel { Orientation = Orientation.Horizontal };
            row.Classes.Add(RowClass);
            for (var c = 0; c < columns; c++)
            {
                var leaf = new Border { Width = 18, Height = 18, Margin = new Thickness(1), BorderThickness = new Thickness(1) };
                leaf.Classes.Add(ClassName(classOffset + r * columns + c));
                leaves?.Add(leaf);
                row.Children.Add(leaf);
            }
            root.Children.Add(row);
        }
        return root;
    }
}
