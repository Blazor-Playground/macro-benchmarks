# Havit startup and size

The Havit app runs on browser CoreCLR. Requires Node.js 22+. Same commands on macOS, Windows and Linux.

For an agent or CI check, run from the repository root:

```sh
npm ci
npm run verify
```

`verify` runs the unit tests, publishes and measures both Debug and Release, and exits. Each build measures five cold/warm Chromium pairs and fails if the app does not render the Getting started page. The SDK and Chromium are installed automatically if missing. Results are written to `artifacts/results`; the last build and its binlog are in `artifacts/publish` and `artifacts/publish.binlog`.

To open the app interactively, run one of these instead of `verify`:

```sh
npm run debug  # interpreted app with R2R CoreLib
npm start      # Release with full composite R2R
```

Run one command at a time. Both commands publish, measure five cold/warm pairs and serve the app at `http://127.0.0.1:5000`. Expect the Getting started page. Stop with Ctrl+C, edit the app and rerun. Linux may need `npx playwright install-deps chromium`.

The pinned .NET 12 SDK targets `net11.0`. The project selects the matching .NET 12 WebAssembly pack because the SDK's default pack for `net11.0` does not support composite R2R. Debug interprets app assemblies with only CoreLib compiled as R2R; Release compiles all assemblies with composite R2R. Builds clear intermediates to avoid a preview SDK incremental R2R bug.

`npm run debug` selects the Debug build configuration; the static server does not provide a managed-debugger proxy.

Results go to `artifacts/results`. Cold starts a new browser; warm reuses its cache. `managedMs` ends at managed initialization; `renderedMs` ends after the first root render and two animation frames. Both start at navigation. Raw/Brotli payload sizes count each asset once; startup transfer counts actual traffic.

Compare timings on the same idle machine, not against fixed thresholds. R2R can still fall back to interpretation.

Local runtime builds can use `npm start -- "-p:RuntimePackDir=/path/to/runtime-pack" "-p:Crossgen2InBuildDir=/path/to/crossgen2"`. Use SDK-compatible packs. Build log is `artifacts/publish.binlog`; tests use `npm test`. MIT licenses remain in `LICENSE` and `src/havit-bootstrap/LICENSE`.
