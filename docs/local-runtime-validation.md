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
