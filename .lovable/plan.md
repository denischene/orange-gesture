# Extraction et injection des modèles de gestes OGC

## Objectifs

1. Une **source unique** de vérité pour le vocabulaire de gestes.
2. Un **fichier téléchargeable** depuis le site (JSON + RDF/XML legacy).
3. Les modèles **embarqués dans le binaire WASM** ; le C++ effectue le matching exact (canonique + alias). Le fuzzy Levenshtein reste en JS comme filet de sécurité.

---

## 1. Source unique — `extension/data/gestures.json`

Schéma proposé (un seul fichier, lisible humain + machine) :

```json
{
  "version": "2.0.0",
  "directions": ["R","UR","U","UL","L","DL","D","DR"],
  "gestures": [
    {
      "id": "tab.next",
      "label": "Onglet suivant",
      "longLabel": "Onglet suivant (répété)",
      "repeat": true,
      "canonical": "URRDRD",
      "aliases": ["UURRDR","UURRDRD","UURDRD","UURRDRR"]
    },
    { "id": "tab.new",  "label": "Nouvel onglet", "canonical": "DUURRDRD",
      "aliases": ["DUURRDR","DUURDRD","DUURRDRR"] },
    …
  ]
}
```

Tout ce qui est aujourd'hui dans `service_worker.js` (carte canonique + `ALIASES` + `label`/`longLabel`/`repeat`) est consolidé ici. `vocabulary.js` et `service_worker.js` deviennent de simples consommateurs (import statique du JSON).

---

## 2. Téléchargements sur le site

Un petit script Node (`scripts/build-gesture-exports.mjs`) lit `gestures.json` et produit :

- `public/ogc-gestures.json` — copie publique (mêmes données, joliment formatées).
- `public/ogc-gestures.rdf` — export RDF/XML compatible avec l'ancien vocabulaire Orange (namespace `ogc:`, un `<ogc:Gesture>` par entrée avec `ogc:sequence`, `ogc:action`, `ogc:label`, `ogc:alias`).

Sur `src/routes/memo.tsx` (ou un nouveau panneau en bas de page) : deux boutons « Télécharger le vocabulaire (JSON) » et « Télécharger (RDF legacy) ». Le script est branché en `prebuild` dans `package.json` pour rester synchro à chaque build.

---

## 3. Injection dans le WASM

### Génération de l'en-tête C++

Le même script génère `extension/native/ogc_vocab.h` à partir du JSON :

```cpp
// AUTO-GÉNÉRÉ — ne pas éditer à la main. Source : extension/data/gestures.json
#pragma once
#include <stdint.h>

struct OgcEntry { const char* seq; uint16_t action_id; };
static const OgcEntry OGC_VOCAB[] = {
  {"L", 0}, {"R", 1}, {"U", 2}, {"D", 3},
  {"URRDRD", 12}, {"UURRDR", 12}, {"UURRDRD", 12},  // tab.next + alias
  …
};
static const uint32_t OGC_VOCAB_LEN = …;

static const char* const OGC_ACTIONS[] = {
  "page.back","page.forward","scroll.up","scroll.down", …
};
static const uint32_t OGC_ACTIONS_LEN = …;
```

Les chaînes sont triées par longueur décroissante puis alphabétique pour permettre un match préfixe efficace.

### Modifications de `ogc_recognizer.cpp`

Trois nouvelles fonctions exportées en plus de l'API existante :

```cpp
// Renvoie l'action_id pour une séquence exacte (canonique ou alias),
// ou 0xFFFF si aucune correspondance.
uint16_t ogc_match(const char* seq);

// Matching direct depuis le buffer interne courant (après ogc_add_point).
uint16_t ogc_match_current(void);

// Accès en lecture seule au nom d'action et au libellé (pour debug / parité JS).
const char* ogc_action_name(uint16_t action_id);
const char* ogc_vocab_seq(uint32_t i);
uint16_t    ogc_vocab_action(uint32_t i);
uint32_t    ogc_vocab_len(void);
```

Implémentation : boucle linéaire `strcmp` sur `OGC_VOCAB` (≈ 50 entrées, tient en quelques µs, garde le binaire petit).

### Build

`extension/native/build-wasm.sh` est mis à jour :

1. Exécute `node scripts/build-gesture-exports.mjs` (régénère `ogc_vocab.h` + les fichiers `public/`).
2. Compile avec `EXPORTED_FUNCTIONS` étendu (`_ogc_match`, `_ogc_match_current`, `_ogc_action_name`, `_ogc_vocab_seq`, `_ogc_vocab_action`, `_ogc_vocab_len`).
3. La mémoire WASM passe de 131 072 à 262 144 octets pour absorber les ~2 Ko de chaînes embarquées.

### Côté JS (`wasm_loader.js` + `service_worker.js`)

- `wasm_loader.js` expose une nouvelle fonction `recognizeAction(points)` qui :
  1. Tokenise via le WASM (déjà en place).
  2. Appelle `ogc_match_current()` ; si succès → renvoie l'`action_id`.
  3. Sinon → renvoie la séquence brute pour que le service worker tente le fuzzy Levenshtein JS.
- `service_worker.js` charge `gestures.json` (statique, import JSON), conserve uniquement la logique de dispatch + fuzzy ; les tables locales `OGC_VOCABULARY`/`ALIASES` disparaissent.
- `lib/vocabulary.js` devient un simple ré-export du JSON pour le popup/options.

---

## Détails techniques

- **Source de vérité unique** : `extension/data/gestures.json`. Tout le reste (JSON public, RDF, en-tête C++, runtime JS) est dérivé via le script. Si on l'oublie, le `prebuild` régénère.
- **Mise à jour `public/ogc.xpi`** : repackagée après build pour inclure le nouveau `.wasm`, le `gestures.json` (chargé via `import` ESM dans le service worker), et le `wasm_loader.js` mis à jour.
- **Compatibilité** : le fallback JS reste opérationnel ; si le WASM échoue, `recognizeStrokeJS` tokenise et la table chargée depuis `gestures.json` sert au matching.
- **Taille** : ~2 Ko de chaînes ajoutées au `.wasm` (négligeable).

---

## Fichiers touchés

| Fichier | Action |
|---|---|
| `extension/data/gestures.json` | **créé** — source unique |
| `scripts/build-gesture-exports.mjs` | **créé** — génère JSON public, RDF, en-tête C++ |
| `extension/native/ogc_vocab.h` | **généré** |
| `extension/native/ogc_recognizer.cpp` | étendu (matching exact) |
| `extension/native/build-wasm.sh` | invoque le générateur, exporte les nouvelles fonctions |
| `extension/background/wasm_loader.js` | nouvelle API `recognizeAction` |
| `extension/background/service_worker.js` | charge JSON, supprime tables inline |
| `extension/lib/vocabulary.js` | ré-export depuis JSON |
| `public/ogc-gestures.json` | **généré** — téléchargeable |
| `public/ogc-gestures.rdf` | **généré** — téléchargeable (legacy) |
| `public/ogc.xpi` | repackagé |
| `src/routes/memo.tsx` | ajout des boutons de téléchargement |
| `package.json` | hook `prebuild` |

## Hors périmètre

- Pas de modification du fuzzy Levenshtein (reste en JS, en filet de sécurité).
- Pas de nouveau geste ni de re-mapping d'actions.
- Pas de portage de l'algorithme Levenshtein en C++ (peut être un palier ultérieur si tu le souhaites).
