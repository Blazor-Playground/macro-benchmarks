using System.Collections.Generic;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Styling;

namespace AvaloniaBench.Scenarios;

/// <summary>
/// Global style matching on attach: with ~160 rules in Application.Styles, each iteration creates a
/// 5×20 subtree of classed Borders, attaches it (styles are matched and applied) and detaches it.
/// No layout pass runs in between. Reports attached controls per second.
/// </summary>
public sealed class StylesAttachScenario : BenchScenario
{
    private const int Rows = 5;
    private const int Columns = 20;

    private Panel? _container;
    private Styles? _styles;
    private int _iteration;

    public override string Name => "styles-attach";

    public override ScenarioKind Kind => ScenarioKind.Managed;

    public override Control CreateView() => _container = new Panel();

    public override void Start()
    {
        _styles = BenchStyles.CreateGlobalStyles();
        Application.Current!.Styles.Add(_styles);

        // Verify that a freshly attached subtree picks up the global rules.
        var leaves = new List<Border>();
        var probe = BenchStyles.CreateRows(1, 2, 0, leaves);
        _container!.Children.Add(probe);
        try
        {
            BenchStyles.EnsureApplied(leaves[1]);
        }
        finally
        {
            _container.Children.Remove(probe);
        }
    }

    public override int RunIteration()
    {
        var subtree = BenchStyles.CreateRows(Rows, Columns, _iteration++);
        _container!.Children.Add(subtree);
        _container.Children.Remove(subtree);
        return Rows * (Columns + 1) + 1;
    }

    public override void Stop()
    {
        if (_styles is not null)
            Application.Current!.Styles.Remove(_styles);
        _styles = null;
        _container = null;
    }
}
