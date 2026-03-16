using System.Security.Claims;
using Microsoft.AspNetCore.Components.Authorization;

namespace BlazingPizza.Client;

internal class FakeAuthenticationStateProvider : AuthenticationStateProvider
{
    private static readonly Task<AuthenticationState> _authState = Task.FromResult(
        new AuthenticationState(new ClaimsPrincipal(new ClaimsIdentity(
            new Claim[]
            {
                new Claim(ClaimTypes.NameIdentifier, "fake-user-id"),
                new Claim(ClaimTypes.Name, "demo@blazingpizza.com"),
                new Claim(ClaimTypes.Email, "demo@blazingpizza.com"),
            },
            authenticationType: "FakeAuth"))));

    public override Task<AuthenticationState> GetAuthenticationStateAsync() => _authState;
}
