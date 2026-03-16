<#
.SYNOPSIS
    Run the bench CLI.

.DESCRIPTION
    Thin wrapper: checks Node.js, ensures bench/ dependencies are installed,
    then runs the TypeScript CLI via tsx.

.EXAMPLE
    ./bench.ps1 --stages resolve-sdk,download-sdk,build,measure
    ./bench.ps1 --via-docker --stages docker-image,resolve-sdk,download-sdk,build,measure
    ./bench.ps1 --dry-run
    ./bench.ps1 --help
#>

$ErrorActionPreference = 'Stop'

$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$BenchDir = Join-Path $RepoDir 'bench'

# ── Helpers ──────────────────────────────────────────────────────────────────

function Info([string]$Text) { Write-Host "▶ $Text" -ForegroundColor Green }
function Err([string]$Text)  { Write-Host "✗ $Text" -ForegroundColor Red }

# ── Prerequisites ────────────────────────────────────────────────────────────

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Err 'Node.js not found. Install Node.js >= 24.'
    exit 1
}

if (-not (Test-Path (Join-Path $BenchDir 'node_modules'))) {
    Info 'Installing bench/ dependencies...'
    Push-Location $BenchDir
    npm ci
    Pop-Location
}

# ── Normalize args ────────────────────────────────────────────────────────────
# PowerShell splits unquoted commas into arrays (e.g. --stages build,measure
# becomes --stages @('build','measure')). Rejoin them so Node sees a single
# comma-separated string.

$NormalizedArgs = @()
foreach ($a in $args) {
    if ($a -is [array]) {
        $NormalizedArgs += ($a -join ',')
    } else {
        $NormalizedArgs += $a
    }
}

# ── Run ──────────────────────────────────────────────────────────────────────

npx --prefix $BenchDir tsx (Join-Path $BenchDir 'src' 'main.ts') @NormalizedArgs

exit $LASTEXITCODE
