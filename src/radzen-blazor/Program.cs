using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Radzen;
using RadzenBlazorDemos;
using RadzenBlazorDemos.Data;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");
builder.Services.AddRadzenComponents();
builder.Services.AddDbContextFactory<NorthwindContext>();
builder.Services.AddScoped<RenderTracker>();

await builder.Build().RunAsync();
