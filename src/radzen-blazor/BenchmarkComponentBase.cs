using Microsoft.AspNetCore.Components;

namespace RadzenBlazorDemos;

public class BenchmarkComponentBase : ComponentBase
{
    [Inject]
    private RenderTracker Tracker { get; set; }

    public override async Task SetParametersAsync(ParameterView parameters)
    {
        Task initialization = base.SetParametersAsync(parameters);
        if (initialization.IsCompletedSuccessfully)
        {
            return;
        }

        Tracker.BeginInitialization();
        try
        {
            await initialization;
        }
        finally
        {
            Tracker.EndInitialization();
        }
    }
}
