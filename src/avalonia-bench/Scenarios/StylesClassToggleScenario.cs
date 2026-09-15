using System.Collections.Generic;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Styling;

namespace AvaloniaBench.Scenarios;

/// <summary>
/// Global style matching on class changes: ~160 rules are added to Application.Styles, then each
/// iteration toggles the "hot" class on 500 Borders, re-evaluating the class-dependent selectors
/// (descendant, :not) and applying or removing their setters. Reports class changes per second.
/// </summary>
public sealed class StylesClassToggleScenario : BenchScenario
{
    private const int Rows = 20;
    private const int Columns = 25;

    private readonly List<Border> _leaves = new(Rows * Columns);
    private Control? _root;
    private Styles? _styles;
    private bool _hot;

    public override string Name => "styles-class-toggle";

    public override ScenarioKind Kind => ScenarioKind.Managed;

    public override Control CreateView()
    {
        _leaves.Clear();
        return _root = BenchStyles.CreateRows(Rows, Columns, 0, _leaves);
    }

    public override void Start()
    {
        _styles = BenchStyles.CreateGlobalStyles();
        Application.Current!.Styles.Add(_styles);

        // Re-attach so the tree is styled with the new global rules (not measured), then verify.
        var host = BenchHost.Current!;
        host.SetContent(null);
        host.SetContent(_root);
        BenchStyles.EnsureApplied(_leaves[1]);
    }

    public override int RunIteration()
    {
        _hot = !_hot;
        foreach (var leaf in _leaves)
        {
            leaf.Classes.Set(BenchStyles.HotClass, _hot);
        }
        return _leaves.Count;
    }

    public override void Stop()
    {
        if (_styles is not null)
            Application.Current!.Styles.Remove(_styles);
        _styles = null;
        _root = null;
        _leaves.Clear();
    }
}
