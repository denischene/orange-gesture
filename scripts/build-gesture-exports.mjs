#!/usr/bin/env node
/**
 * Build artifacts from the single source of truth: extension/data/gestures.json.
 * Outputs:
 *   - extension/native/ogc_vocab.h        (embedded in WASM build)
 *   - public/ogc-gestures.json            (downloadable, pretty-printed)
 *   - public/ogc-gestures.rdf             (downloadable, legacy OGC RDF/XML)
 *
 * Wired into npm "prebuild" so every site build re-derives these.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "extension/data/gestures.json");

const vocab = JSON.parse(readFileSync(SRC, "utf8"));

/* ---------- public JSON ---------- */
const pubJson = resolve(ROOT, "public/ogc-gestures.json");
mkdirSync(dirname(pubJson), { recursive: true });
writeFileSync(pubJson, JSON.stringify(vocab, null, 2) + "\n");

/* ---------- public RDF (legacy OGC vocabulary format) ---------- */
const xmlEscape = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
           .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const rdfLines = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<rdf:RDF',
  '  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"',
  '  xmlns:ogc="http://orange-gesture-control.org/vocab#"',
  '  xmlns:dc="http://purl.org/dc/elements/1.1/">',
  `  <ogc:Vocabulary rdf:about="urn:ogc:vocab:${xmlEscape(vocab.version)}">`,
  `    <dc:title>Orange Gesture Control vocabulary</dc:title>`,
  `    <dc:description>${xmlEscape(vocab.description)}</dc:description>`,
  `    <ogc:version>${xmlEscape(vocab.version)}</ogc:version>`,
  `  </ogc:Vocabulary>`,
];
for (const g of vocab.gestures) {
  rdfLines.push(`  <ogc:Gesture rdf:about="urn:ogc:action:${xmlEscape(g.id)}">`);
  rdfLines.push(`    <ogc:action>${xmlEscape(g.id)}</ogc:action>`);
  rdfLines.push(`    <ogc:label xml:lang="fr">${xmlEscape(g.label)}</ogc:label>`);
  if (g.longLabel)
    rdfLines.push(`    <ogc:longLabel xml:lang="fr">${xmlEscape(g.longLabel)}</ogc:longLabel>`);
  if (g.repeat) rdfLines.push(`    <ogc:repeat>true</ogc:repeat>`);
  rdfLines.push(`    <ogc:sequence>${xmlEscape(g.canonical)}</ogc:sequence>`);
  for (const a of g.aliases || [])
    rdfLines.push(`    <ogc:alias>${xmlEscape(a)}</ogc:alias>`);
  rdfLines.push(`  </ogc:Gesture>`);
}
rdfLines.push("</rdf:RDF>", "");
writeFileSync(resolve(ROOT, "public/ogc-gestures.rdf"), rdfLines.join("\n"));

/* ---------- C++ header embedded in the WASM ---------- */
// Build a flat (sequence -> action_id) table including canonical + aliases.
// Sort by length desc then alpha so longest-match wins if we ever switch to prefix matching.
const actions = vocab.gestures.map((g) => g.id);
const actionIndex = new Map(actions.map((a, i) => [a, i]));

const entries = [];
for (const g of vocab.gestures) {
  const id = actionIndex.get(g.id);
  entries.push({ seq: g.canonical, action: id });
  for (const a of g.aliases || []) entries.push({ seq: a, action: id });
}
entries.sort((a, b) =>
  b.seq.length - a.seq.length || (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0)
);

const cEscape = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const labels = vocab.gestures.map((g) => g.label);

const headerLines = [
  "// AUTO-GÉNÉRÉ par scripts/build-gesture-exports.mjs — ne pas éditer.",
  "// Source : extension/data/gestures.json",
  "#pragma once",
  "#include <stdint.h>",
  "",
  "struct OgcEntry { const char* seq; uint16_t action_id; };",
  "",
  "static const OgcEntry OGC_VOCAB[] = {",
  ...entries.map((e) => `    { "${cEscape(e.seq)}", ${e.action} },`),
  "};",
  `static const uint32_t OGC_VOCAB_LEN = ${entries.length};`,
  "",
  "static const char* const OGC_ACTIONS[] = {",
  ...actions.map((a) => `    "${cEscape(a)}",`),
  "};",
  "static const char* const OGC_LABELS[] = {",
  ...labels.map((l) => `    "${cEscape(l)}",`),
  "};",
  `static const uint32_t OGC_ACTIONS_LEN = ${actions.length};`,
  "",
];
writeFileSync(resolve(ROOT, "extension/native/ogc_vocab.h"), headerLines.join("\n"));

console.log(
  `[gestures] ${vocab.gestures.length} gestures, ${entries.length} sequences ` +
  `→ public/ogc-gestures.{json,rdf} + extension/native/ogc_vocab.h`
);

/* ---------- extension/lib/vocabulary.js (legacy global, for content script) ---------- */
const vocabPairs = [];
for (const g of vocab.gestures) {
  vocabPairs.push(`    ${JSON.stringify(g.canonical)}: ${JSON.stringify(g.id)}`);
  for (const a of g.aliases || []) {
    vocabPairs.push(`    ${JSON.stringify(a)}: ${JSON.stringify(g.id)}`);
  }
}
const vocabJs = [
  "/* AUTO-GÉNÉRÉ par scripts/build-gesture-exports.mjs — ne pas éditer.",
  " * Source : extension/data/gestures.json",
  " * Vocabulaire (séquence -> action) exposé en global pour le content script. */",
  "(function (root) {",
  "  const OGC_VOCABULARY = {",
  vocabPairs.join(",\n"),
  "  };",
  "  root.OGC_VOCABULARY = OGC_VOCABULARY;",
  "})(typeof window !== \"undefined\" ? window : globalThis);",
  "",
].join("\n");
writeFileSync(resolve(ROOT, "extension/lib/vocabulary.js"), vocabJs);

/* ---------- extension/data/gestures.data.js (ESM, for service worker) ---------- */
// JSON import assertions aren't universal in MV3 service workers yet, so we
// expose the vocabulary as a plain ES module export.
const dataJs =
  "// AUTO-GÉNÉRÉ par scripts/build-gesture-exports.mjs — ne pas éditer.\n" +
  "// Source : extension/data/gestures.json\n" +
  "export default " + JSON.stringify(vocab, null, 2) + ";\n";
writeFileSync(resolve(ROOT, "extension/data/gestures.data.js"), dataJs);