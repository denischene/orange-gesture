/* Loads the native OGC recognizer (C++ → WebAssembly) inside the MV3 service
 * worker via WebAssembly.instantiateStreaming. Falls back to ArrayBuffer
 * instantiation if the runtime refuses streaming (Firefox MV3 currently serves
 * extension assets as application/octet-stream).
 *
 * The wasm module is built as STANDALONE_WASM (no Emscripten JS glue), so the
 * only import it needs is a memory object — provided here.
 */

const DIR_CHARS = ["R", "UR", "U", "UL", "L", "DL", "D", "DR"];
const MIN_SEGMENT = 24;

let modulePromise = null;
let wasmDisabled = false; // set to true once WASM is known unusable

function jsAngleToDir(dx, dy) {
  const a = (Math.atan2(-dy, dx) * 180) / Math.PI;
  const n = (a + 360) % 360;
  if (n <  22.5 || n >= 337.5) return "R";
  if (n <  67.5)               return "UR";
  if (n < 112.5)               return "U";
  if (n < 157.5)               return "UL";
  if (n < 202.5)               return "L";
  if (n < 247.5)               return "DL";
  if (n < 292.5)               return "D";
  return "DR";
}

function recognizeStrokeJS(points) {
  const tokens = [];
  let last = null;
  for (const [x, y] of points) {
    if (!last) { last = [x, y]; continue; }
    const dx = x - last[0], dy = y - last[1];
    if (Math.hypot(dx, dy) < MIN_SEGMENT) continue;
    const dir = jsAngleToDir(dx, dy);
    if (tokens[tokens.length - 1] !== dir) tokens.push(dir);
    last = [x, y];
  }
  return tokens.join("");
}

function instantiate() {
  if (modulePromise) return modulePromise;
  const url = browser.runtime.getURL("wasm/ogc_recognizer.wasm");
  const memory = new WebAssembly.Memory({ initial: 4, maximum: 4 });
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
      bufferPtr:    exp.ogc_buffer,
      match:        exp.ogc_match,
      matchCurrent: exp.ogc_match_current,
      actionName:   exp.ogc_action_name,
      vocabLen:     exp.ogc_vocab_len,
      vocabSeq:     exp.ogc_vocab_seq,
      vocabAction:  exp.ogc_vocab_action
    };
  })();
  return modulePromise;
}

function readCString(memory, ptr) {
  if (!ptr) return "";
  const view = new Uint8Array(memory.buffer);
  let end = ptr;
  while (view[end] !== 0) end++;
  return new TextDecoder("utf-8").decode(view.subarray(ptr, end));
}

export async function recognizeStroke(points) {
  if (wasmDisabled) return recognizeStrokeJS(points);

  let wasm;
  try {
    wasm = await instantiate();
  } catch (err) {
    console.warn("[OGC] WASM unavailable, using JS fallback:", err);
    wasmDisabled = true;
    modulePromise = null;
    return recognizeStrokeJS(points);
  }

  try {
    wasm.reset();
    for (const [x, y] of points) wasm.addPoint(x, y);
    const count = wasm.tokenCount();
    const ptr   = wasm.bufferPtr();
    const view  = new Uint8Array(wasm.memory.buffer, ptr, count);
    let seq = "";
    for (let i = 0; i < count; i++) seq += DIR_CHARS[view[i]] ?? "";
    return seq;
  } catch (err) {
    console.warn("[OGC] WASM recognition threw, using JS fallback:", err);
    wasmDisabled = true;
    modulePromise = null;
    return recognizeStrokeJS(points);
  }
}

/**
 * Tokenize + native exact match in one round-trip.
 * Returns { sequence, actionId, actionName } where actionId is null if no
 * embedded entry matched (caller can then fall back to fuzzy matching in JS).
 */
export async function recognizeAction(points) {
  const sequence = await recognizeStroke(points);
  if (wasmDisabled) return { sequence, actionId: null, actionName: null };
  try {
    const wasm = await instantiate();
    if (typeof wasm.matchCurrent !== "function") {
      return { sequence, actionId: null, actionName: null };
    }
    const id = wasm.matchCurrent();
    if (id === 0xffff) return { sequence, actionId: null, actionName: null };
    const namePtr = wasm.actionName(id);
    return {
      sequence,
      actionId: id,
      actionName: readCString(wasm.memory, namePtr)
    };
  } catch (err) {
    console.warn("[OGC] native match failed:", err);
    return { sequence, actionId: null, actionName: null };
  }
}

// Warm the module at startup so the first gesture has zero latency.
// If preload fails, mark WASM disabled so the very first stroke skips the
// retry attempt and goes straight to the JS fallback.
export function preload() {
  instantiate().catch((err) => {
    console.warn("[OGC] wasm preload failed, JS fallback will be used:", err);
    wasmDisabled = true;
    modulePromise = null;
  });
}