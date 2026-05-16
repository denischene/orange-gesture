#!/usr/bin/env bash
# Build the OGC native recognizer to WebAssembly using Emscripten.
# Output: extension/wasm/ogc_recognizer.wasm (loaded by background/wasm_loader.js).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$HERE/../wasm"
mkdir -p "$OUT_DIR"

# Regenerate the embedded vocabulary header from the JSON source of truth.
node "$HERE/../../scripts/build-gesture-exports.mjs"

nix shell nixpkgs#emscripten -c \
  emcc "$HERE/ogc_recognizer.cpp" \
    -O3 \
    -s WASM=1 \
    -s STANDALONE_WASM=1 \
    -s ALLOW_MEMORY_GROWTH=0 \
    -s INITIAL_MEMORY=262144 \
    -s TOTAL_STACK=16384 \
    -s EXPORTED_FUNCTIONS='["_ogc_reset","_ogc_add_point","_ogc_token_count","_ogc_token_at","_ogc_buffer","_ogc_match","_ogc_match_current","_ogc_action_name","_ogc_vocab_seq","_ogc_vocab_action","_ogc_vocab_len","_malloc","_free"]' \
    --no-entry \
    -o "$OUT_DIR/ogc_recognizer.wasm"

echo "Built $OUT_DIR/ogc_recognizer.wasm ($(stat -c%s "$OUT_DIR/ogc_recognizer.wasm") bytes)"