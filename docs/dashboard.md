# Dashboard and NET12 focus

The Blazor viewer is in `src/bench-viewer`. Home and `/net12-focus` share
branding and mode links at the top of their left pane. Home keeps its app tabs,
filters and update links. Delta reports remain accessible through point details
or their existing route, not a mode tab.

## Focus selections

Defaults are **Blazor Havit**, **publish/R2R vs publish**, **mobile startup**,
and the last **14 inclusive UTC calendar days**. All published apps remain
selectable; unavailable measurements keep their cards with an explanation.

Flavor direction is always **CoreCLR versus Mono**:

| Choice | CoreCLR preset | Mono preset |
|---|---|---|
| publish vs publish | App publish baseline | App publish baseline |
| publish/R2R vs publish | `aot` (ReadyToRun) | App publish baseline |
| publish/R2R vs publish/AOT | `aot` (ReadyToRun) | `aot` (Mono AOT) |

These are existing **configured publish** presets, not untouched SDK defaults.
MSBuild `Configuration=Release`, producer presets, historical row identities and
stable flavor selection IDs are unchanged. `chart/focus-selection.ts` is the
shared authority for effective cohorts, labels and selection defaults.

The **app publish baseline** is resolved once from all its loaded eligible SDK 12
Focus metric row identities, before cropping dates or selecting a startup
profile. Any `no-workload` row retains `no-workload` throughout the app, including
all-null rows or rows covering only one runtime, metric, profile or engine.
Only when no `no-workload` rows exist can published `native-relink` rows supply
the baseline slots. When neither preset is published, the baseline is unavailable;
no other preset is substituted. Explicit CoreCLR R2R and Mono AOT slots always
remain `aot`.

Effective labels, comparison context, tooltips and card row metadata disclose the
choice. There is no per-cell, per-metric or per-runtime fallback: missing selected
rows and non-overlapping SDK variants remain gaps. A Mono-only app has no
CoreCLR comparison.

**Startup profile** affects only cold startup. Mobile emulates 3x CPU slowdown,
20 Mbps download, 5 Mbps upload and 70 ms latency; desktop has no throttling.
The other three metrics use the selected flavor's **desktop/Chromium rows**.
Download measurements are not assumed to be profile-independent.

| Card | Published key | Display and boundary |
|---|---|---|
| Cold startup / Time to managed (cold) | `time-to-reach-managed-cold` | Milliseconds from JS bootstrap to managed-ready, not runtime creation or navigation-to-LCP |
| Walkthrough | App-specific, e.g. `havit-walkthrough` | Scenario milliseconds converted to seconds; initial load excluded |
| Cold download size | `download-size-cold` | First cold-load encoded bytes in decimal MB (1,000,000 bytes) |
| Build time | `compile-time` | Clean publish milliseconds converted to seconds; preceding restore excluded |

Focus selects SDK channel 12 and excludes known custom runtime/ASP.NET builds.
The actual recorded TFM is shown separately: an SDK 12 build can target
`net11.0`. Missing metadata is unknown, not proof of a stock build.

## Comparisons and history

Each card uses its newest complete CoreCLR/Mono pair inside the selected date
range. Values must be finite and positive, from the same bucket/column/full SDK
variant, with matching effective profile and engine and the selected preset pair.
There is no nearest-date or independent-latest-runtime matching.

The percentage is `100 * (CoreCLR / Mono - 1)`. Positive means slower/larger;
negative means faster/smaller. The headline shows the magnitude and verdict.
One-decimal values rounding to zero are neutral. Colors do not imply statistical
significance or reciprocal throughput speedup. Zero/invalid baselines never
produce a ratio.

The smaller **5 avg** is the mean of up to five consecutive per-SDK percentages
ending at that same matched SDK. It is not a ratio of runtime means and remains
visible when graph smoothing or visibility changes. Its accessible description
states the actual count and SDK/day span.

If newer data is incomplete, the older complete pair is labeled. SDK day, age and
version appear once below the grid when cards share a build; differing latest
variants are grouped there by metric name. No out-of-range result supplies a
headline.

The 14-day window includes today and the preceding thirteen UTC days. Month
ranges subtract one, three, six or twelve calendar months with end-of-month
clamping. Filtering uses `releaseDate`, the **SDK build/release day**, not the
storage bucket's runtime-commit week or representative measurement timestamp.
Each ordered SDK variant gets a distinct, equally spaced x position, including
builds sharing a day. Date labels indicate **SDK order, not elapsed time**.
Short history is disclosed, not supplemented with older SDK channels.

## Graph settings

Defaults: **Actual measurements on**, **Percentage curve off**, **No average**.

- Actual measurements controls both runtime curves and their shared units axis.
- Percentage curve controls the comparison curve, percentage axis and 0% parity.
- Both on shows three curves. Both off removes chart instances, canvases, axes,
  bands and the legend, leaving compact summary cards and active data selectors.

Graph-only changes do not fetch data or alter either summary. With graphs off,
smoothing/band controls disable but retain their preferences.

Selecting **5-point average** averages the current observation and up to four
preceding contiguous valid observations, independently per series. Missing or
invalid values create gaps and reset the affected window. Percentage smoothing
averages individual percentages, not the ratio of runtime means. Windows are
computed before date cropping so overlapping points do not change with the range.

Optional **20%-opacity min-max bands** show raw extrema from each exact rolling
window, on that series' axis. Boundaries are open; only fills close. One-point
windows have zero spread. Bands are observed ranges, not confidence intervals.
Raw mode disables bands while retaining their preference. Hover tooltips expose
raw values, means, extrema, counts and spans; there is no inspection panel.
Focus uses Chart.js's built-in canvas tooltip and color boxes. Text wraps to the
canvas width; averaged mode uses compact spacing and one unit suffix for each
mean/min/max line. Raw values, SDK/day and each series' window count and span
remain visible. Profile and provenance stay in the card/page context rather than
a repeated tooltip footer. No HTML overlay, custom scrolling or tooltip event
handlers are needed.

The grid uses two columns from 1280px and one below that; below 800px the settings
stack above the cards. This leaves room for the native tooltip while preserving
the four-card desktop layout.

## Data source and limits

Home, Focus and Delta request app-relative `data/views/`. Focus loads headers
before selecting SDK12 buckets, then only the chosen app's relevant metric files.
It validates schema/array lengths and rechecks the index around loading, with
one bounded retry. Required-resource, HTTP and malformed-data failures are
visible errors, not unavailable metrics.

Caches are scoped to the source and publication marker. Flavor/profile/range
changes reuse the loaded all-row publication; **Refresh data** reloads it.
Aborted selections cannot overwrite newer reports. Focus charts have a separate
lifetime from Home charts.

These are historical dimension-matched results, not certified same-environment
experiments. Published cells omit exact hardware/browser, evaluated build settings,
methodology revision and reliable per-cell timestamps. The examined Havit runtime
jobs used different runners. Header timestamps are representative; index refresh
time is not measurement time. A stable marker does not prove atomic publication
or immutable per-cell provenance.

## Build and preview

Run from the repository root with a compatible .NET SDK and Node 24+.
No benchmark stages, Docker or wasm-tools installation are needed.
On macOS with Homebrew, include `/opt/homebrew/bin` in `PATH`.

```bash
export PATH="/opt/homebrew/bin:$PATH"
npm run build:viewer
node --experimental-strip-types tests/helpers/serve-viewer.mjs
```

`build:viewer` publishes only `BenchViewer.csproj` to `artifacts/bench-viewer`.
The project restores locked viewer npm dependencies, compiles TypeScript before
static-asset discovery, and copies Bootstrap CSS/map/license. Generated assets
are ignored; the first publish includes fingerprinted modules and an import map.

The loopback helper prints its URL/PID and preserves `/macro-benchmarks/`, MIME
types and SPA fallback. Ctrl-C closes it and removes its temporary mount
symlinks, not published files. `PORT` selects a port (default: an available one);
`VIEWER_WWWROOT` overrides the published root.

### Direct links on GitHub Pages

GitHub Pages serves static files, not Blazor routes. On a direct visit to
`/macro-benchmarks/net12-focus` or `/macro-benchmarks/delta`, the published
`404.html` redirects to the **project root**, carrying the requested path, query
and fragment in a `redirect` parameter. Before Blazor starts, the viewer restores
that same-project URL with `history.replaceState`, without another request.
Recovery rejects malformed URLs, destinations outside the dashboard base path
or origin, and embedded credentials with a console warning.
Normal in-app navigation needs no redirect.

Publish and deploy the updated viewer assets together, including `404.html`,
`index.html` and the fingerprinted modules. The local helper's automatic SPA
fallback does not reproduce Pages' initial 404; browser tests explicitly
exercise that response and the subsequent route restoration.

### Choose the data source

Set `VIEWER_DATA_URL` when starting the helper:

| Value | Data served |
|---|---|
| Unset/empty | Local `wwwroot/data/views/` |
| `https://blazor-playground.github.io/macro-benchmarks/data/views/` | Deployed Pages results |
| `https://raw.githubusercontent.com/Blazor-Playground/macro-benchmarks/gh-pages/data/views/` | Current `gh-pages` branch |
| The preceding URL with a commit SHA instead of `gh-pages` | Immutable publication at that commit |

For example:

```bash
export PATH="/opt/homebrew/bin:$PATH"
VIEWER_DATA_URL=https://blazor-playground.github.io/macro-benchmarks/data/views/ \
  node --experimental-strip-types tests/helpers/serve-viewer.mjs
```

The remote-data proxy forwards only view JSON requests, without client
credentials, caching or fallback to local data. Its source is printed and returned
in `X-Viewer-Data-Source`. It also disables local preview asset caching to avoid
stale assemblies after republishing; benchmark-server caching is unchanged.
Changing sources needs a helper restart, not a rebuild or checkout.

For local/offline data, export the already-fetched publication into the output:

```bash
export PATH="/opt/homebrew/bin:$PATH"
set -o pipefail
git archive --format=tar origin/gh-pages -- data/views |
  tar -xf - -C artifacts/bench-viewer/wwwroot
```

Use an exact commit instead of `origin/gh-pages` to retain an immutable snapshot.
An empty/rebuilding publication remains empty; the helper never chooses an older
snapshot silently.

## Local runtime comparisons

For [local runtime measurements](local-runtime-measurements.md), publish the viewer
as above, then install the comparison's portable data bundle:

```bash
mkdir -p artifacts/bench-viewer/wwwroot/data
cp <comparison-directory>/dashboard.json \
  artifacts/bench-viewer/wwwroot/data/local-runtime-comparison.json
node --import ./bench/node_modules/tsx/dist/loader.mjs tests/helpers/serve-viewer.mjs
```

Open the printed `/net12-focus` URL with `?local=true`. This explicit mode reads
only `data/local-runtime-comparison.json`; it does not publish data or change the
normal SDK/custom-build filters.

The local view defaults to mobile startup and desktop for other metrics. Each
curve identifies its recorded mode: CoreCLR after, Mono before and CoreCLR before.
The headline compares after with Mono; the smaller line compares CoreCLR after
with CoreCLR before. Without Mono, the headline uses after vs before.
Recorded commits, dirty state, SDK/pack/TFM and setup warnings remain visible;
local experiments are not relabeled as official SDK history.

## Tests

```bash
export PATH="/opt/homebrew/bin:$PATH"
npm ci
npm ci --prefix src/bench-viewer
npm test
npm run test:e2e
```

- **Unit tests** recompile and import production TypeScript modules. They exercise
  per-app baseline selection (including all-null/one-sided no-workload rows),
  pairing, dates, windows, errors, cache/lifetime handling and chart configuration.
  Network/DOM adapters are stubbed where needed; proxy tests use real loopback HTTP.
- **Browser tests** use the source-built Blazor app, real Chart.js, controls and
  canvas operations. By default Playwright publishes the current checkout, audits
  its assets and serves that output on loopback port 5147. It does not reuse an
  old local preview. Recorded data and the clock are fixed; failure tests also
  inject HTTP or canvas errors. Canvas instrumentation forwards real drawing calls.
- **Fixtures** retain published values from
  `854d0c7ddedde9401b223b696f99a5d753c464ee`: two SDK12 buckets, focus metrics and
  one delta report. In this fixture, Semi Avalonia has native-relink rows for
  both runtimes; Uno Gallery has only Mono measurements.
  The expected-value helper is restricted to its frozen
  September 20 window and unique day/SDK pairs. Separate synthetic browser cases
  use literal expectations for date cropping/lookback and tied SDK variants.

An installed Chrome is used by default; `PLAYWRIGHT_CHANNEL` can select another
installed compatible browser. No test downloads live measurement data or runs
benchmarks. The suite does not validate benchmark-producer accuracy or certify
cross-runner comparability.

To deliberately test an existing source preview, set
`NET12_PREVIEW_URL=http://127.0.0.1:PORT`. That bypasses the automatic publish and
server startup, so it tests the application at that URL, not necessarily the
current checkout. Its view JSON is still fixture-served.
