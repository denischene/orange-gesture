/* Moteur unique de correspondance des gestes (séquence dashée -> action).
 * Partagé par le service worker et les tests. Source : gestures.json. */
(function (root) {
// Build the runtime vocabulary from the single JSON source of truth.
// Every canonical sequence + every alias maps to the same entry so the
// JS fallback (when WASM fails) and the fuzzy matcher share one table.
const OGC_VOCABULARY = {};
const GESTURES = root.OGC_GESTURES_DATA;
const ENTRY_BY_ACTION = {};
// Tokenise une séquence brute (canonical/alias dans gestures.json) en
// tokens directionnels puis joint par "-" pour matcher le format dashé
// émis par le recognizer JS (lib/recognizer.js).
function dashifySeq(seq) {
  const out = [];
  let i = 0;
  while (i < seq.length) {
    const two = seq.substr(i, 2);
    if (two === "UR" || two === "UL" || two === "DR" || two === "DL") {
      out.push(two); i += 2;
    } else {
      out.push(seq[i]); i += 1;
    }
  }
  return out.join("-");
}
for (const g of GESTURES.gestures) {
  const entry = {
    action: g.id,
    label: g.label,
    ...(g.longLabel ? { longLabel: g.longLabel } : {}),
    ...(g.repeat ? { repeat: true } : {})
  };
  ENTRY_BY_ACTION[g.id] = entry;
  OGC_VOCABULARY[dashifySeq(g.canonical)] = entry;
  for (const a of g.aliases || []) {
    const k = dashifySeq(a);
    if (!OGC_VOCABULARY[k]) OGC_VOCABULARY[k] = entry;
  }
}

/* ---------- fuzzy matching ---------- */

// Tokenize a sequence string into an array of direction tokens
// (UR/UL/DR/DL are 2-char tokens; U/D/L/R are 1-char).
function tokenize(seq) {
  // Le recognizer JS produit désormais des séquences dashées
  // (« U-R », « D-R-U-R »…). On accepte aussi les anciennes formes
  // compactes par sécurité.
  if (seq.indexOf("-") >= 0) return seq.split("-").filter(Boolean);
  const out = [];
  let i = 0;
  while (i < seq.length) {
    const two = seq.substr(i, 2);
    if (two === "UR" || two === "UL" || two === "DR" || two === "DL") {
      out.push(two); i += 2;
    } else {
      out.push(seq[i]); i += 1;
    }
  }
  return out;
}

// Substitution cost between two direction tokens (0 same, 1 neighbour, 2 far).
const DIR_INDEX = { R: 0, UR: 1, U: 2, UL: 3, L: 4, DL: 5, D: 6, DR: 7 };
function subCost(a, b) {
  if (a === b) return 0;
  const da = DIR_INDEX[a], db = DIR_INDEX[b];
  if (da == null || db == null) return 2;
  let d = Math.abs(da - db);
  if (d > 4) d = 8 - d;
  return d === 1 ? 1 : 2;
}

function dirDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + subCost(a[i - 1], b[j - 1])
      );
    }
  }
  return dp[m][n];
}

const VOCAB_KEYS = Object.keys(OGC_VOCABULARY);
const VOCAB_TOKENS = VOCAB_KEYS.map((k) => ({ key: k, tokens: tokenize(k) }));

function matchTokens(inputTokens) {
  let best = null;
  let bestCost = Infinity;
  let bestKeyLen = 0;
  for (const { key, tokens } of VOCAB_TOKENS) {
    // Pas de matching flou pour les clés très courtes : elles doivent être
    // saisies exactement (ex. U-U-R ≠ diagonale UR « agrandir »).
    if (tokens.length <= 2 || inputTokens.length <= 2) continue;
    const lenDiff = Math.abs(tokens.length - inputTokens.length);
    if (lenDiff > Math.max(2, Math.ceil(tokens.length * 0.4))) continue;
    const d = dirDistance(inputTokens, tokens);
    const threshold = Math.max(2, Math.ceil(tokens.length * 0.45));
    if (d <= threshold && (d < bestCost || (d === bestCost && tokens.length > bestKeyLen))) {
      best = OGC_VOCABULARY[key];
      bestCost = d;
      bestKeyLen = tokens.length;
    }
  }
  return { best, cost: bestCost };
}

function findVocab(seq) {
  if (OGC_VOCABULARY[seq]) return OGC_VOCABULARY[seq];
  const dashed = matchTokens(tokenize(seq));
  // Lecture compacte (« U-R » relu « UR ») : c'est ainsi que l'ancien
  // moteur WebAssembly voyait le tracé. On la garde comme seconde lecture
  // et on retient la plus proche, pour ne perdre aucun geste reconnu avant.
  const compact = seq.replace(/-/g, "");
  if (compact === seq) return dashed.best;
  const alt = matchTokens(tokenize(compact));
  return alt.cost < dashed.cost ? alt.best : dashed.best;
}

root.OGC_MATCHER = { OGC_VOCABULARY, ENTRY_BY_ACTION, dashifySeq, tokenize, findVocab };
})(typeof window !== "undefined" ? window : globalThis);
