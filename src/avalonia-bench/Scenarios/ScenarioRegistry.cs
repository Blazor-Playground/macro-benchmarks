using System;
using System.Collections.Generic;
using System.Linq;

namespace AvaloniaBench.Scenarios;

public static class ScenarioRegistry
{
    public static IReadOnlyList<BenchScenario> All { get; } =
    [
        new VirtualizedScrollScenario(),
        new ControlTemplatesScenario(),
        new TextLayoutScenario(),
        new SkiaDrawingScenario(),
        new LayoutResizeScenario(),
        new RenderTransformAnimationScenario(),
        new CompositionAnimationScenario(),
        new TreeChurnScenario(),
        new PropertySetGetScenario(),
        new PropertyInheritanceScenario(),
        new StylesClassToggleScenario(),
        new StylesAttachScenario(),
        new HitTestScenario(),
        new DispatcherPostScenario(),
    ];

    public static BenchScenario Get(string name)
        => All.FirstOrDefault(s => s.Name == name)
           ?? throw new ArgumentException($"Unknown scenario '{name}'", nameof(name));
}
