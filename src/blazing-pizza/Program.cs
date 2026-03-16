global using BlazingPizza.Shared;
global using BlazingPizza.Client;

using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Microsoft.AspNetCore.Components.Authorization;

var builder = WebAssemblyHostBuilder.CreateDefault(args);

builder.RootComponents.Add<BlazingPizza.Client.App>("#app");
builder.RootComponents.Add<Microsoft.AspNetCore.Components.Web.HeadOutlet>("head::after");

builder.Services.AddScoped<IRepository, InMemoryRepository>();
builder.Services.AddScoped<OrderState>();

builder.Services.AddAuthorizationCore();
builder.Services.AddSingleton<AuthenticationStateProvider, FakeAuthenticationStateProvider>();

await builder.Build().RunAsync();
