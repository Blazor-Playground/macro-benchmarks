#!/bin/bash
# bench.sh — Run the bench CLI.
#
# Thin wrapper: checks Node.js, ensures bench/ dependencies are installed,
# then runs the TypeScript CLI via tsx.
#
# Usage:
#   ./bench.sh --stages resolve-sdk,download-sdk,build,measure
#   ./bench.sh --via-docker --stages docker-image,resolve-sdk,download-sdk,build,measure
#   ./bench.sh --dry-run
#   ./bench.sh --help

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCH_DIR="$REPO_DIR/bench"

# ── Helpers ──────────────────────────────────────────────────────────────────

info()  { echo -e "\033[0;32m▶ $1\033[0m"; }
err()   { echo -e "\033[0;31m✗ $1\033[0m" >&2; }

# ── Prerequisites ────────────────────────────────────────────────────────────

if ! command -v node &>/dev/null; then
    err "Node.js not found. Install Node.js >= 24."
    exit 1
fi

if [[ ! -d "$BENCH_DIR/node_modules" ]]; then
    info "Installing bench/ dependencies..."
    (cd "$BENCH_DIR" && npm ci)
fi

# ── Run ──────────────────────────────────────────────────────────────────────

exec npx --prefix "$BENCH_DIR" tsx "$BENCH_DIR/src/main.ts" "$@"
