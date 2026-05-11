#!/bin/bash
set -ex

# Verify tools (now baked into docker image)
cmake --version | head -1
ninja --version
clang --version | head -1

# Run the full pipeline
npx --prefix bench tsx bench/src/main.ts \
  --stages resolve-sdk,download-sdk,build-runtime,build \
  --runtime-pr 127905 \
  --app empty-browser \
  --preset dev-loop \
  --runtime coreclr \
  --verbose
