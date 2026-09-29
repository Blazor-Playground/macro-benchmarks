using System.Linq;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Presenters;
using Avalonia.Controls.Templates;
using Avalonia.Data;
using Avalonia.Layout;
using Avalonia.Media;

namespace AvaloniaBench.Scenarios;

/// <summary>
/// Virtualization: an <see cref="ItemsControl"/> with a <see cref="VirtualizingStackPanel"/> over
/// 10,000 items in a <see cref="ScrollViewer"/> (templates are built in code, as the app has no theme).
/// Each iteration scrolls by a bit more than 7 items, bouncing at the ends, and runs a layout pass, so
/// containers are recycled, rebound and measured. Rows draw a bar (no text, so text shaping stays in
/// the text-layout scenario). Reports scroll steps per second.
/// </summary>
public sealed class VirtualizedScrollScenario : BenchScenario
{
    private const int ItemCount = 10_000;
    private const double ItemHeight = 24;
    private const double Step = 173;

    private static readonly IBrush[] s_brushes =
        [Brushes.SteelBlue, Brushes.IndianRed, Brushes.SeaGreen, Brushes.Goldenrod, Brushes.MediumPurple];

    private static readonly RowItem[] s_items =
        Enumerable.Range(0, ItemCount).Select(i => new RowItem(40 + (i * 37) % 400, s_brushes[i % s_brushes.Length])).ToArray();

    private ScrollViewer? _scrollViewer;
    private double _direction = 1;

    public override string Name => "virtualized-scroll";

    public override ScenarioKind Kind => ScenarioKind.Managed;

    public override Control CreateView()
    {
        _direction = 1;
        return new ItemsControl
        {
            ItemsSource = s_items,
            ItemsPanel = new FuncTemplate<Panel?>(() => new VirtualizingStackPanel()),
            ItemTemplate = new FuncDataTemplate<RowItem>((_, _) => CreateItem(), supportsRecycling: true),
            Template = new FuncControlTemplate<ItemsControl>((_, scope) =>
            {
                _scrollViewer = new ScrollViewer
                {
                    Name = "PART_ScrollViewer",
                    Template = new FuncControlTemplate<ScrollViewer>((_, svScope) =>
                        new ScrollContentPresenter { Name = "PART_ScrollContentPresenter" }.RegisterInNameScope(svScope)),
                    Content = new ItemsPresenter
                    {
                        Name = "PART_ItemsPresenter",
                        [~ItemsPresenter.ItemsPanelProperty] = new TemplateBinding(ItemsControl.ItemsPanelProperty),
                    }.RegisterInNameScope(scope),
                };
                return _scrollViewer.RegisterInNameScope(scope);
            }),
        };
    }

    public override int RunIteration()
    {
        var scrollViewer = _scrollViewer!;
        var max = scrollViewer.Extent.Height - scrollViewer.Viewport.Height;
        var y = scrollViewer.Offset.Y + _direction * Step;
        if (y >= max)
        {
            y = max;
            _direction = -1;
        }
        else if (y <= 0)
        {
            y = 0;
            _direction = 1;
        }
        scrollViewer.Offset = new Vector(0, y);
        scrollViewer.UpdateLayout();
        return 1;
    }

    public override void Stop() => _scrollViewer = null;

    private static Control CreateItem()
    {
        // Recycled containers keep this control and only get a new DataContext.
        var bar = new Border
        {
            Height = 12,
            HorizontalAlignment = HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Center,
        };
        var row = new Border
        {
            Height = ItemHeight,
            Padding = new Thickness(8, 0),
            BorderBrush = Brushes.LightGray,
            BorderThickness = new Thickness(0, 0, 0, 1),
            Child = bar,
        };
        row.DataContextChanged += (_, _) =>
        {
            if (row.DataContext is RowItem item)
            {
                bar.Width = item.Width;
                bar.Background = item.Brush;
            }
        };
        return row;
    }

    private sealed record RowItem(double Width, IBrush Brush);
}
