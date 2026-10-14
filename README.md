# Havit CoreCLR repro

Requires Node.js 22+. From the repository root:

```sh
npm ci
npm start        # Release (default): full composite ReadyToRun
npm run debug    # Debug: interpreted app, ReadyToRun CoreLib
```

Run one configuration at a time. Each command publishes the app, measures five cold/warm Chromium starts, then serves it at `http://127.0.0.1:5000`. Open the Getting started page and stop the server with Ctrl+C. Chromium is installed automatically if missing; the default mode also installs the pinned .NET SDK.

For an agent or CI, use `npm run verify` after `npm ci`. It runs the tests, publishes and measures both configurations, writes JSON to `artifacts/results`, and exits without leaving a server running. The latest publish and binlog are in `artifacts/publish` and `artifacts/publish.binlog`.

The pinned .NET 12 SDK builds a `net11.0` app. `Debug` is the build configuration, not an attached managed debugger; this static server has no debugger proxy. Local desktop timings are not directly comparable to mobile-throttled dashboard measurements.

## Test the current dotnet/runtime main

A nightly SDK is a snapshot, not necessarily the current runtime source. To test
an exact commit, use a separate `dotnet/runtime` checkout, update it to the
revision you want, and record its SHA before building. Install the runtime
checkout's [native build prerequisites](https://github.com/dotnet/runtime/blob/main/docs/workflow/README.md)
and follow the [CoreCLR browser build guide](https://github.com/dotnet/runtime/blob/main/docs/workflow/building/coreclr/wasm.md).
For example, create a checkout and build **both** configurations and their
product packs:

```sh
git clone https://github.com/dotnet/runtime.git /path/to/runtime
cd /path/to/runtime
git fetch origin main
git switch main
git pull --ff-only
git rev-parse HEAD

./build.sh clr+libs+host -os browser -arch wasm -c Release /p:RuntimeFlavor=CoreCLR
./build.sh packs.product -os browser -arch wasm -c Release /p:RuntimeFlavor=CoreCLR
./build.sh clr+libs+host -os browser -arch wasm -c Debug /p:RuntimeFlavor=CoreCLR
./build.sh packs.product -os browser -arch wasm -c Debug /p:RuntimeFlavor=CoreCLR
```

On Windows, use `build.cmd` instead of `./build.sh`. Rebuild **and repackage**
after any source edit. From this repository's root, run:

```sh
npm ci
npm start -- --runtime-repo /path/to/runtime          # Release: full composite R2R
npm run debug -- --runtime-repo /path/to/runtime      # Debug: R2R CoreLib only
npm run verify -- --runtime-repo /path/to/runtime     # Tests, then both modes without serving
```

Run one command at a time and stop the serving command with Ctrl+C. The
`--runtime-repo` path must be the checkout root, not its `artifacts` directory.
Each mode selects the corresponding Release or Debug runtime and WebAssembly
packages, Crossgen2 task files, and compiler from that checkout. It uses the
checkout's bootstrap SDK rather than this branch's pinned SDK, restores the two
packs exclusively from the local Shipping directory, and verifies their content.
Missing or ambiguous build artifacts cause an error rather than a fallback to
nightly packages. The checkout SHA, dirty status, versions, and compiler path are
saved with each result in `artifacts/results`; publish outputs and binlog retain
their usual locations. Keep the checkout, SDK, and browser fixed when comparing
results. The app still targets `net11.0`, and its ASP.NET packages remain pinned;
only the runtime, WebAssembly pack, and R2R tools come from your checkout.
These desktop measurements do not reproduce the dashboard's mobile throttling,
Mono comparison, or walkthrough metric, and do not publish to it.
