# Havit CoreCLR repro

Requires Node.js 22+. From this repository's root:

```sh
npm ci
npm start       # Release: full composite ReadyToRun
npm run debug   # Debug: interpreted app, ReadyToRun CoreLib
```

Each command publishes the app, measures five cold and five warm Chromium starts,
then serves it at `http://127.0.0.1:5000` until Ctrl+C. The pinned SDK and
Chromium are installed if missing. For CI, `npm run verify` tests and measures
both configurations without leaving a server running.

## Test dotnet/runtime main instead

Install the [runtime's native build prerequisites](https://github.com/dotnet/runtime/blob/main/docs/workflow/README.md).
From this repository's root, clone main once and run:

```sh
git clone --branch main --single-branch https://github.com/dotnet/runtime.git ../runtime
npm run local -- --runtime-repo ../runtime
```

`npm run local` builds and packages browser CoreCLR in Debug and Release, then
publishes and measures both modes. It exits without serving; results in
`artifacts/results` record the runtime commit and package versions. To test
newer commits, update the runtime checkout and rerun the same command.
The app still targets `net11.0` with pinned ASP.NET packages. These desktop
measurements are not directly comparable with the mobile-throttled dashboard.
