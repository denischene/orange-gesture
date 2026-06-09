
# Plan d’implémentation (révisé)

## 1. Contraste page Préférences
- `extension/options/options.css` : passer `--ogc-muted: #64748b` → `#334155`. Impacte « Préférences » (sous-titre), `.ogc-hint`, `.ogc-status`, `.ogc-lead-sm`, `.ogc-gesture-seq`, `.ogc-wizard-progress`, `.ogc-seq`. Les textes noirs restent noirs.

## 2. Sélection préservée après « Copier » — Firefox
- Sur Firefox PC uniquement, après le geste Copier, la sélection est effacée à `pointerup`.
- Dans `extension/content_scripts/gestures.js` :
  - Avant `e.preventDefault()` final sur Firefox, capturer les ranges actifs (`getRangeAt(i)`) si une sélection non vide existe ET si l’action déclenchée est Copier.
  - Après envoi du message au background, réinjecter via `removeAllRanges()` + `addRange()` dans un `requestAnimationFrame` (+ second RAF de sécurité).
  - Détection : `navigator.userAgent.includes("Firefox")` — le fix n’est pas appliqué ailleurs.
- L’action Copier sera identifiée côté content script via `actionHint` (ou en consultant la valeur `copy.selection` exposée par `OGC_VOCABULARY`). En pratique, on conservera la sélection à chaque fois qu’elle existe ET que le geste produit une action différente de « page.back/forward/scroll.up/scroll.down » (gestes qui doivent légitimement déselectionner) — à affiner selon le mapping réel.

## 3. Haut/Bas de page (angles droits)

Réinterprétation : un **angle droit** produit ≥ 2 tokens consécutifs identiques sur chaque segment, donc des séquences comme `UUR`, `URR`, `UURR`, `UUUR`, `URRR`, etc. Une **diagonale** unique reste `UR` (1 token). Cela permet de **conserver** `window.maximize = UR` et `window.minimize = DL` sans conflit.

`extension/data/gestures.json` :
- `page.top` : canonical `UUR`, aliases `URR`, `UURR`, `UUUR`, `URRR`, `UUURR`, `UURRR`, `UUL`, `ULL`, `UULL`, `UUUL`, `ULLL`, `UUULL`, `UULLL`.
- `page.bottom` : canonical `DDR`, aliases `DRR`, `DDRR`, `DDDR`, `DRRR`, `DDDRR`, `DDRRR`, `DDL`, `DLL`, `DDLL`, `DDDL`, `DLLL`, `DDDLL`, `DDLLL`.

Illustrations (à créer en GIF animé + PNG statique, même style/épaisseur que `accueil.gif`) :
- `page.top` : trait vertical montant puis trait horizontal vers la droite (forme ⌐ retournée). Fichiers : `up_right_angle.png/.gif`.
- `page.bottom` : trait vertical descendant puis trait horizontal vers la droite (forme L inversé). Fichiers : `down_right_angle.png/.gif`.

Mise à jour des illustrations dans :
- `extension/img/` + `public/img/` (PNG + GIF générés via le script Node de génération de GIF que nous avons déjà utilisé pour `accueil.gif`).
- Mapping `GESTURE_IMG` : `extension/options/options.js`, `extension/popup/popup.js`, `extension/sidebar/sidebar.js`, `src/routes/memo.tsx`.

## 4. Nouveaux gestes « Élément suivant » / « Élément précédent »

`extension/data/gestures.json` :
- `element.next` : canonical `RD`, aliases `RDD`, `RRD`, `RRDD`. `repeat: true`. `label: "Élément suivant"`, `longLabel: "Élément suivant (répété)"`.
- `element.prev` : canonical `LD`, aliases `LDD`, `LLD`, `LLDD`, `LU`, `LUU`, `LLU`, `LLUU`. `repeat: true`. `label: "Élément précédent"`, `longLabel: "Élément précédent (répété)"`.

Illustrations :
- `element.next` : reprise des fichiers actuels de page.bottom (`left_right_bottom.png/.gif`) → renommés et dédiés à `element.next` (nouveau fichier `element_next.png/.gif` copié depuis `left_right_bottom`).
- `element.prev` : miroir vertical (flip horizontal en réalité — « mirroir vertical » dans la consigne) de `left_right_bottom`, fichiers `element_prev.png/.gif`. Génération via ImageMagick `-flop`.
- Point orange + libellé long lors de la 2ᵉ animation : déjà géré par le pipeline d’animation existant (repeat=true + longLabel).

Implémentation backend (`extension/background/service_worker.js`) :
- Nouveaux handlers `element.next` / `element.prev`.
- Action : via `chrome.scripting.executeScript`, fonction injectée qui :
  1. récupère tous les éléments focusables (`a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), audio[controls], video[controls], [contenteditable], iframe`),
  2. filtre les visibles (`offsetParent !== null` + non-`disabled`),
  3. trie par `tabindex` puis ordre DOM,
  4. trouve l’index de `document.activeElement`, focus le suivant / précédent (avec wrap).
- Répétition gérée comme pour les autres gestes répétables.

## 5. Nouveau geste « Valider » (V)

`extension/data/gestures.json` :
- `element.activate` : canonical `DR` puis `UR` = sequences `DRUR`, aliases `DRRUR`, `DRURR`, `DDRUR`, `DRRUUR`, `DDRUUR`, `DRUUR`. Pas de `repeat`.
- `label: "Valider"`.

Illustration : nouveau visuel `validate.png/.gif` — un V dessiné en orange (même technique que les autres : ligne canvas → PNG → GIF via script Node).

Backend : `document.activeElement?.click()` + dispatch `KeyboardEvent("keydown", {key:"Enter", code:"Enter", bubbles:true})` puis `keyup` sur l’élément actif (pour couvrir les inputs et les boutons).

## 6. Propagation des changements de vocabulaire

- Régénérer via `node scripts/build-gesture-exports.mjs` : `extension/lib/vocabulary.js`, `extension/data/gestures.data.js`, `public/ogc-gestures.json`, `public/ogc-gestures.rdf`, `extension/native/ogc_vocab.h`.
- Recompiler le WASM via `extension/native/build-wasm.sh` si l’environnement le permet (sinon laisser le fallback JS prendre le relais — le JS lit le JSON directement, donc la reconnaissance reste correcte sans rebuild WASM).
- Repackager `public/ogc.xpi`, `public/ogc-chrome.zip`, `public/ogc-edge.zip`, `public/ogc-opera.zip`, `public/ogc-brave.zip`.

## 7. Mise à jour de l’UI

- Page de mémo (`src/routes/memo.tsx`) : ajouter 3 nouvelles vignettes (Élément suivant, Élément précédent, Valider) ; mettre à jour les illustrations Haut/Bas de page.
- Panneau d’aide gestes (`extension/sidebar/sidebar.js`) : ajouter les 3 nouvelles cellules ; mettre à jour les illustrations Haut/Bas.
- Préférences (`extension/options/options.js`, mapping `GESTURE_IMG`) : ajouter les 3 nouvelles entrées ; mettre à jour mapping Haut/Bas.

---

## Fichiers touchés (résumé)
- `extension/options/options.css`
- `extension/content_scripts/gestures.js`
- `extension/data/gestures.json` (+ régénérés : `gestures.data.js`, `lib/vocabulary.js`, `native/ogc_vocab.h`, `public/ogc-gestures.json`, `public/ogc-gestures.rdf`)
- `extension/background/service_worker.js`
- `extension/popup/popup.js`, `extension/sidebar/sidebar.js`, `extension/options/options.js`
- `src/routes/memo.tsx`
- Nouvelles images : `up_right_angle`, `down_right_angle`, `element_next`, `element_prev`, `validate` (PNG + GIF, dans `extension/img/` et `public/img/`)
- 5 packages ré-zippés dans `public/`

