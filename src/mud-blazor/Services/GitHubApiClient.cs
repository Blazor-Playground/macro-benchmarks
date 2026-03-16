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
    public class GitHubApiClient : IDisposable
    {
        private readonly HttpClient _http;
        private readonly JsonSerializerOptions _jsonSerializerOptions;

        public GitHubApiClient()
        {
            _http = new HttpClient
            {
                BaseAddress = new Uri("https://api.github.com:443/")
            };
            _http.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.106 Mobile Safari/537.36");
            _jsonSerializerOptions = new JsonSerializerOptions
            {
                TypeInfoResolver = JsonTypeInfoResolver.Combine(GithubApiJsonSerializerContext.Default)
            };
        }

        public async Task<GithubContributors[]> GetContributorsAsync()
        {
            return Array.Empty<GithubContributors>();
        }

        public async Task<GitHubReleases[]> GetReleasesAsync()
        {
            return Array.Empty<GitHubReleases>();
        }

        public async Task<GitHubRepository?> GetRepositoryAsync(string owner, string repo)
        {
                return null;
        }

        public async Task<int> GetContributorsCountAsync(string owner, string repo)
        {
            return 0;
        }

        public void Dispose()
        {
            _http.Dispose();
        }
    }
}
