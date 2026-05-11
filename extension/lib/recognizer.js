/* 8-direction tokenizer — replaces the native C++ XPCOM recognizer. */
(function (root) {
  const MIN_SEGMENT = 24; // px before a direction is registered

  function angleToDir(dx, dy) {
    const a = (Math.atan2(-dy, dx) * 180) / Math.PI; // -180..180, 0 = right
    const n = (a + 360) % 360;
    if (n < 22.5 || n >= 337.5) return "R";
    if (n < 67.5)  return "UR";
    if (n < 112.5) return "U";
    if (n < 157.5) return "UL";
    if (n < 202.5) return "L";
    if (n < 247.5) return "DL";
    if (n < 292.5) return "D";
    return "DR";
  }

  class Recognizer {
    constructor() { this.reset(); }
    reset() { this.points = []; this.tokens = []; this.last = null; }
    addPoint(x, y) {
      this.points.push([x, y]);
      if (!this.last) { this.last = [x, y]; return; }
      const dx = x - this.last[0], dy = y - this.last[1];
      if (Math.hypot(dx, dy) < MIN_SEGMENT) return;
      const dir = angleToDir(dx, dy);
      if (this.tokens[this.tokens.length - 1] !== dir) this.tokens.push(dir);
      this.last = [x, y];
    }
    sequence() { return this.tokens.join(""); }
  }
  root.OGC_Recognizer = Recognizer;
})(typeof window !== "undefined" ? window : globalThis);