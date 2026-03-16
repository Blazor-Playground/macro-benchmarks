using System;
using System.Net.Http;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Microsoft.Extensions.DependencyInjection;
using MudBlazor.Docs.Extensions;
using MudBlazor.Docs.Models;
using MudBlazor.Docs.Services;
using MudBlazor.Docs.Services.Notifications;
using MudBlazor.Examples.Data;

var builder = WebAssemblyHostBuilder.CreateDefault(args);

builder.RootComponents.Add<MudBlazor.Docs.App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

builder.Services.TryAddDocsViewServices();
// Register HttpClient with WebApiHandler to intercept webapi/* requests
// (replaces server-side PeriodicTableController / AmericanStatesController)
builder.Services.AddScoped(sp =>
{
    var periodicTable = sp.GetRequiredService<IPeriodicTableService>();
    var handler = new WebApiHandler(periodicTable, new HttpClientHandler());
    return new HttpClient(handler) { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) };
});

var build = builder.Build();

var notificationService = build.Services.GetService<INotificationService>();
if (notificationService is InMemoryNotificationService inMemoryService)
{
    inMemoryService.Preload();
}

// Warm up the documentation
ApiDocumentation.GetType("MudAlert");

await build.RunAsync();
