/* Loads the native OGC recognizer (C++ → WebAssembly) inside the MV3 service
 * worker via WebAssembly.instantiateStreaming. Falls back to ArrayBuffer
 * instantiation if the runtime refuses streaming (Firefox MV3 currently serves
 * extension assets as application/octet-stream).
 *
 * The wasm module is built as STANDALONE_WASM (no Emscripten JS glue), so the
 * only import it needs is a memory object — provided here.
 */

const DIR_CHARS = ["R", "UR", "U", "UL", "L", "DL", "D", "DR"];

let modulePromise = null;

function instantiate() {
  if (modulePromise) return modulePromise;
  const url = browser.runtime.getURL("wasm/ogc_recognizer.wasm");
  const memory = new WebAssembly.Memory({ initial: 2, maximum: 2 });
  const imports = { env: { memory }, wasi_snapshot_preview1: {} };

  modulePromise = (async () => {
    let result;
    try {
      result = await WebAssembly.instantiateStreaming(fetch(url), imports);
    } catch (_streamErr) {
      // Fallback for runtimes that don't recognize the wasm MIME type.
      const bytes = await (await fetch(url)).arrayBuffer();
      result = await WebAssembly.instantiate(bytes, imports);
    }
    const exp = result.instance.exports;
    // STANDALONE_WASM "reactor" modules expose _initialize for static ctors.
    if (typeof exp._initialize === "function") exp._initialize();
    return {
      memory: exp.memory ?? memory,
      reset:        exp.ogc_reset,
      addPoint:     exp.ogc_add_point,
      tokenCount:   exp.ogc_token_count,
      tokenAt:      exp.ogc_token_at,
      bufferPtr:    exp.ogc_buffer
    };
  })();
  return modulePromise;
}

export async function recognizeStroke(points) {
  const wasm = await instantiate();
  wasm.reset();
  for (const [x, y] of points) wasm.addPoint(x, y);

  const count = wasm.tokenCount();
  const ptr   = wasm.bufferPtr();
  const view  = new Uint8Array(wasm.memory.buffer, ptr, count);
  let seq = "";
  for (let i = 0; i < count; i++) seq += DIR_CHARS[view[i]] ?? "";
  return seq;
}

// Warm the module at startup so the first gesture has zero latency.
export function preload() { instantiate().catch((err) => console.warn("[OGC] wasm preload failed", err)); }