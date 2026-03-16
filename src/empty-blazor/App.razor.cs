using Microsoft.AspNetCore.Components;
using System;
using System.Runtime.InteropServices.JavaScript;
using System.Threading.Tasks;

namespace EmptyBlazor;

public partial class App : ComponentBase
{
    protected override async Task OnInitializedAsync()
    {
        await base.OnInitializedAsync();

        SetManagedReady();
    }

    [JSImport("bench.setManagedReady", "main.mjs")]
    internal static partial void SetManagedReady();
}
