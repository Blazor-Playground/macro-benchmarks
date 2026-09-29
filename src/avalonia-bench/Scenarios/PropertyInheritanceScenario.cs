using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;

namespace AvaloniaBench.Scenarios;

/// <summary>
/// Inherited property propagation: an inheritable attached property (with no layout/render effect)
/// changes at the root of a ~2100-control tree (10 × 10 × 10 × nested Border). Every 7th subgroup
/// has a local value that stops propagation below it. Reports root changes per second.
/// </summary>
public sealed class PropertyInheritanceScenario : BenchScenario
{
    private const int Groups = 10;
    private const int SubGroups = 10;
    private const int Leaves = 10;

    public static readonly AttachedProperty<double> LevelProperty =
        AvaloniaProperty.RegisterAttached<PropertyInheritanceScenario, Control, double>("Level", inherits: true);

    private StackPanel? _root;
    private int _iteration;

    public override string Name => "property-inheritance";

    public override ScenarioKind Kind => ScenarioKind.Managed;

    public override Control CreateView()
    {
        _root = new StackPanel();
        for (var g = 0; g < Groups; g++)
        {
            var group = new StackPanel();
            for (var s = 0; s < SubGroups; s++)
            {
                var subGroup = new StackPanel { Orientation = Avalonia.Layout.Orientation.Horizontal };
                if ((g * SubGroups + s) % 7 == 0)
                    subGroup.SetValue(LevelProperty, -1d);
                for (var l = 0; l < Leaves; l++)
                {
                    subGroup.Children.Add(new Border
                    {
                        Width = 4,
                        Height = 4,
                        Background = Brushes.Gray,
                        Child = new Border(),
                    });
                }
                group.Children.Add(subGroup);
            }
            _root.Children.Add(group);
        }
        return _root;
    }

    public override int RunIteration()
    {
        _root!.SetValue(LevelProperty, (double)++_iteration);
        return 1;
    }

    public override void Stop() => _root = null;
}
