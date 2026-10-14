# Havit CoreCLR repro

Requires Node.js 22+. Run `npm ci` from this repository's root first.

## Pinned SDK

```sh
npm start       # Release: full composite ReadyToRun
npm run debug   # Debug: interpreted app, ReadyToRun CoreLib
```

Both publish, measure five cold and five warm Chromium starts, and serve at
`http://127.0.0.1:5000` until Ctrl+C. The pinned SDK and Chromium install if
missing. `npm run verify` tests and measures both without serving.

## Current dotnet/runtime main

Install the [runtime's native build prerequisites](https://github.com/dotnet/runtime/blob/main/docs/workflow/README.md).
Clone main once, then run one command for **both Debug and Release**:

```sh
git clone --branch main --single-branch https://github.com/dotnet/runtime.git ../runtime
npm run local -- --runtime-repo ../runtime
```

`npm run local` builds, packages, and measures Debug **then** Release. It saves
separate results with the runtime SHA in `artifacts/results` and exits without
serving. To serve one using the **already-built** runtime:

```sh
npm run debug -- --runtime-repo ../runtime  # Debug
npm start -- --runtime-repo ../runtime      # Release
```

These individual commands do not rebuild `dotnet/runtime`. Update its checkout
to test newer commits. The app still targets `net11.0` with pinned ASP.NET
packages; desktop timings do not match the mobile-throttled dashboard.
