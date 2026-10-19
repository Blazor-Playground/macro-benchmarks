import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('live Blazor apps declare a private SDK-matched development server', async () => {
    for (const [app, project] of [
        ['empty-blazor', 'EmptyBlazor.csproj'],
        ['havit-bootstrap', 'HavitBootstrap.csproj'],
    ]) {
        const xml = await readFile(new URL(`../../src/${app}/${project}`, import.meta.url), 'utf8');
        const reference = xml.match(/<PackageReference\b[^>]*\bInclude="Microsoft\.AspNetCore\.Components\.WebAssembly\.DevServer"[^>]*\/>/)?.[0];
        assert.ok(reference, `${app} must declare its Blazor development host`);
        assert.match(reference, /\bVersion="\$\(MicrosoftAspNetCoreVersion\)"/);
        assert.match(reference, /\bPrivateAssets="all"/);
        assert.match(reference, /\bCondition="'\$\(MicrosoftAspNetCoreVersion\)' == '\$\(BundledNETCoreAppPackageVersion\)'"/);
    }
});
