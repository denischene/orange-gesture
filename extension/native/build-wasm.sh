#!/usr/bin/env bash
# Build the OGC native recognizer to WebAssembly using Emscripten.
# Output: extension/wasm/ogc_recognizer.wasm (loaded by background/wasm_loader.js).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$HERE/../wasm"
mkdir -p "$OUT_DIR"

nix shell nixpkgs#emscripten -c \
  emcc "$HERE/ogc_recognizer.cpp" \
    -O3 \
    -s WASM=1 \
    -s STANDALONE_WASM=1 \
    -s ALLOW_MEMORY_GROWTH=0 \
    -s INITIAL_MEMORY=131072 \
    -s TOTAL_STACK=16384 \
    -s EXPORTED_FUNCTIONS='["_ogc_reset","_ogc_add_point","_ogc_token_count","_ogc_token_at","_ogc_buffer"]' \
    --no-entry \
    -o "$OUT_DIR/ogc_recognizer.wasm"

echo "Built $OUT_DIR/ogc_recognizer.wasm ($(stat -c%s "$OUT_DIR/ogc_recognizer.wasm") bytes)"