# Havit CoreCLR repro

Requires Node.js 22+. From the repository root:

```sh
npm ci
npm start        # Release (default): full composite ReadyToRun
npm run debug    # Debug: interpreted app, ReadyToRun CoreLib
```

Run one configuration at a time. Each command publishes the app, measures five cold/warm Chromium starts, then serves it at `http://127.0.0.1:5000`. Open the Getting started page and stop the server with Ctrl+C. The pinned .NET SDK and Chromium are installed automatically if missing.

For an agent or CI, use `npm run verify` after `npm ci`. It runs the tests, publishes and measures both configurations, writes JSON to `artifacts/results`, and exits without leaving a server running. The latest publish and binlog are in `artifacts/publish` and `artifacts/publish.binlog`.

The pinned .NET 12 SDK builds a `net11.0` app. `Debug` is the build configuration, not an attached managed debugger; this static server has no debugger proxy. Local desktop timings are not directly comparable to mobile-throttled dashboard measurements.
