using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using MudBlazor.Examples.Data;
using MudBlazor.Examples.Data.Models;

namespace MudBlazor.Docs.Services;

/// <summary>
/// HttpMessageHandler that intercepts webapi/* requests and serves data
/// from embedded resources, replacing the server-side API controllers
/// that exist in the full MudBlazor.Docs.Server project.
/// </summary>
public sealed class WebApiHandler : DelegatingHandler
{
    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly IPeriodicTableService _periodicTable;

    public WebApiHandler(IPeriodicTableService periodicTable, HttpMessageHandler innerHandler)
        : base(innerHandler)
    {
        _periodicTable = periodicTable;
    }

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var path = request.RequestUri?.AbsolutePath?.TrimStart('/') ?? string.Empty;

        // webapi/periodictable  or  webapi/periodictable/{search}
        if (path.StartsWith("webapi/periodictable", StringComparison.OrdinalIgnoreCase))
        {
            var search = path.Length > "webapi/periodictable".Length
                ? Uri.UnescapeDataString(path.Substring("webapi/periodictable/".Length))
                : string.Empty;
            var elements = await _periodicTable.GetElements(search);
            return JsonResponse(elements);
        }

        // webapi/AmericanStates/searchWithDelay/{value}  or  webapi/AmericanStates/*
        if (path.StartsWith("webapi/americanstates", StringComparison.OrdinalIgnoreCase))
        {
            var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
            var search = segments.Length > 2
                ? Uri.UnescapeDataString(segments[^1])
                : string.Empty;
            var states = AmericanStates.GetStates(search);
            return JsonResponse(states);
        }

        // Not a webapi request — pass through to default handler (for real HTTP, static files, etc.)
        return await base.SendAsync(request, cancellationToken);
    }

    private static HttpResponseMessage JsonResponse<T>(T data)
    {
        var json = JsonSerializer.Serialize(data, _jsonOptions);
        return new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json")
        };
    }
}
