// Non-régression du moteur unique : chaque tracé synthétique (22 gestes,
// alias, variantes bruitées) doit être reconnu comme son geste attendu.
// Lancer : node tests/recognition.test.mjs
import fs from "fs"; import vm from "vm"; import { execFileSync } from "child_process";
const E = new URL("../extension/", import.meta.url).pathname;
const ctx = {}; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ["data/gestures.data.js", "lib/recognizer.js", "lib/matcher.js"])
  vm.runInContext(fs.readFileSync(E + f, "utf8"), ctx);
const casesFile = "/tmp/ogc-cases.json";
execFileSync("node", [new URL("gen-strokes.mjs", import.meta.url).pathname, E, casesFile]);
const cases = JSON.parse(fs.readFileSync(casesFile, "utf8"));
const M = ctx.OGC_MATCHER; const fails = [];
const results = cases.map((c) => {
  const r = new ctx.OGC_Recognizer(); for (const [x, y] of c.points) r.addPoint(x, y);
  const seq = r.sequence(); const e = M.OGC_VOCABULARY[seq] || M.findVocab(seq);
  const got = e ? e.action : null;
  if (got !== c.gesture) fails.push(`${c.gesture} (${c.source}) -> ${got} [${seq}]`);
  return got;
});
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(results));
console.log(`${cases.length - fails.length}/${cases.length} reconnus`);
// Seuil = résultat de l'ancien circuit (WASM + JS) sur ces mêmes tracés : 1032.
if (cases.length - fails.length < 1033) { console.log(fails.slice(0, 30).join("\n")); process.exit(1); }
