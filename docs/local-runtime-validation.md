# Local runtime workflow validation

Validated on macOS/arm64 on 2026-10-09 using dotnet/runtime
`5b5586c987e26b4c4faba0582bbcebe3dabb71ee`.

## Real default commands

The actual command sequence used the existing smoke checkout path and no other
bootstrap options, followed by two option-free iterations:

```bash
node bench/bootstrap.mjs <smoke-runtime-checkout>
node bench/iterate.mjs
node bench/iterate.mjs
```

No build was mocked and no measurement cache was seeded. The checkout contained
an intentional 2,000 ms initialization delay. No further edits were made between
iteration rounds.

| Round | Exit | Wall time | Build/package commands | Control reuse |
|---|---:|---:|---:|---|
| Bootstrap | 0 | 43m 09s | 6 | Both controls built/published/measured |
| Iterate 1 | 0 | 10m 08s | 2 | Both control manifests reused |
| Iterate 2 | 0 | 10m 18s | 2 | Same controls reused; fresh after again |

Controls were separate clean merge-base Mono interpreter and CoreCLR composite
clones. After used the dirty supplied checkout. HEAD, porcelain status, staged/
unstaged diffs and the changed-loader hash remained unchanged after every command.
Each iteration produced a distinct after manifest and result set.

All sides passed 10 cold/5 warm samples per desktop/mobile profile and one desktop
walkthrough. Mobile cold startup aggregates were:

| Round | Mono before | Composite before | Composite after |
|---|---:|---:|---:|
| Bootstrap | 2,443 ms | 5,115 ms | 7,101 ms |
| Iterate 1 | 2,443 ms (cached) | 5,115 ms (cached) | 7,140 ms |
| Iterate 2 | 2,443 ms (cached) | 5,115 ms (cached) | 7,150 ms |

The approximately 2-second change confirms the deliberate delay, not an
optimization or statistical significance. The SDK was `11.0.100-rc.1.26420.103`,
TFM `net11.0` and runtime/workload packages `12.0.0-dev`; metadata was not relabeled SDK12.

## Environment and recovery

Node24 and installed Chrome `155.0.8059.40` were used. Existing native NuGet/WASM
tool caches were reused through their standard environment variables; the
publisher still used fresh per-run restore caches.

Initial attempts found an empty stale lock and then a NuGet.org TLS outage.
After confirming no live comparison, only the empty lock was removed. With user
approval, local publisher defaults selected the official dotnet-public mirror.
Repository/runtime feed configuration and TLS/audit settings were not changed.
The successful commands still used no source-exclusion or sample flags.
Real Mono source outputs from the failed attempts were reused incrementally;
the successful measurement caches were newly generated.

## Other checks and limits

- Chart compilation and 164 unit tests passed, plus 6 local context/result tests.
- Viewer Razor/C# build/publish passed with 0 errors and 20 existing warnings.
- Real browser checks confirmed mobile selection, mode labels and chart points.
- The CLI type-check retained its 52 pre-existing diagnostics.
- Earlier local-package/Crossgen2 tests also passed non-composite R2R. Initial
  mixed CI-artifact R2R publishes failed navigation and were correctly rejected.
- Mono AOT and every historical stock SDK callback combination remain unverified.

Full machine-specific commands, logs, fingerprints and source/cache identities
remain in ignored local artifacts:
`artifacts/runtime-bootstrap-proof/plain-default-workflow-check.md`,
`plain-default-check/check.json`, and per-run build/measurement logs.
They are not dependencies of the contributor workflow.

## Windows x64 validation

Validated on 2026-10-15 using dotnet/runtime
`ce202f8f8183262f77bf094a5860390f3af92a2d`, Node.js 24.13.1,
Visual Studio 2026 18.2 and installed Chrome 155.0.8059.40.

The real bootstrap workflow was resumed after a machine restart with
`node bench\iterate.mjs` from a Visual Studio Developer Command Prompt.
Existing clean control checkouts and incremental native build outputs were
reused, without mocking builds or seeding measurement caches. Chrome updated
from 153 to 155 during the restart, so controls were remeasured rather than
reusing incompatible browser results.

Mono interpreter before and CoreCLR composite before/after all built, packaged,
published and passed Chrome desktop/mobile measurements: 10 cold and 5 warm
samples per profile, and one desktop walkthrough. All three source checkouts
were clean at the same revision; this validates the workflow, not a runtime
performance change. Saved-results display also passed.

A subsequent `node bench\bootstrap.mjs artifacts\windows-runtime` exited 0,
reused both measured controls and incrementally rebuilt/published/measured after
again. The control manifests were unchanged and the after manifest was fresh.

The run exposed and corrected Windows loader file URLs, hardened command lookup,
Git long-path configuration, native build output path lengths and inherited
`Platform=x64` settings affecting browser publishes. A separate intermittent
CoreCLR startup failure came from Havit registering imports before the runtime
API was ready; the early Mono fallback now checks availability while the
dedicated ready callback remains authoritative.

Repository tests passed (168), as did the benchmark CLI tests (13).
Real logs and evidence remain in ignored artifacts:
`artifacts/windows-bootstrap-ready-fix.log`,
`artifacts/windows-bootstrap-final.log`,
`artifacts/c/comparison-XcnwhY/comparison.json`,
`artifacts/c/comparison-lROyMH/comparison.json`, and the per-publish logs/results.

PR preparation on 2026-10-16 incorporated current `main`, including its shared
runtime-ready callback compatibility fix. Repository tests passed (181), along
with the 13 bootstrap-related CLI tests. The full CLI suite had 30 passing,
one skipped and one failing test: the unchanged upstream dev-loop process
cleanup test invokes Unix `ps` on Windows (`spawn ps ENOENT`).
A fresh CoreCLR composite publish and desktop/mobile smoke measurement also
passed on this updated base using the existing native outputs (one cold/warm
sample per profile and one desktop walkthrough). Its log is
`artifacts/windows-pr-publish-smoke.log`.
