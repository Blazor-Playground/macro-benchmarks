// Copyright (c) MudBlazor 2021
// MudBlazor licenses this file to you under the MIT license.
// See the LICENSE file in the project root for more information.

using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization.Metadata;
using MudBlazor.Docs.Models;
using MudBlazor.Docs.Models.Context;

namespace MudBlazor.Docs.Services
{
#nullable enable
    public class NugetApiClient : IDisposable
    {
        private readonly HttpClient _http;
        private readonly JsonSerializerOptions _jsonSerializerOptions;

        public NugetApiClient()
        {
            _http = new HttpClient
            {
                BaseAddress = new Uri("https://azuresearch-usnc.nuget.org/")
            };
            _jsonSerializerOptions = new JsonSerializerOptions
            {
                TypeInfoResolver = JsonTypeInfoResolver.Combine(NugetApiJsonSerializerContext.Default)
            };
        }

        public async Task<NugetPackage?> GetPackageAsync(string packageName)
        {
            return null;
        }

        public void Dispose()
        {
            _http.Dispose();
        }
    }
}
