# Un seul moteur de reconnaissance des gestes

## Ce que j'ai trouvé
Aujourd'hui, un même geste passe par **4 mécanismes** qui font en partie le même travail :

1. **Moteur de la page** (`lib/recognizer.js`) : transforme le tracé en directions séparées par des tirets (ex. « U-R »). Il sert à l'aperçu, à l'appui long et à l'arbitrage tactile Android.
2. **Moteur C++/WebAssembly** (`ogc_recognizer.wasm`) : il refait tout le calcul dans l'extension. Ses séquences sont collées (« UR »), donc on ne distingue plus un angle droit d'une diagonale. En plus, sa table de gestes interne (`ogc_vocab.h`) est maintenue à part et ne suit pas les derniers gestes ajoutés.
3. **Moteur JS de secours** (dans `wasm_loader.js`) : une copie du n°2, utilisée quand le WebAssembly ne se charge pas (Firefox, Android…).
4. **Deux tables de gestes** : `lib/vocabulary.js`, utilisée dans la page pour l'« indice d'action », et la table construite depuis `gestures.json` dans l'arrière-plan, qui sert à la correspondance exacte et approchée.

Résultat : le geste est calculé 2 fois avec des règles différentes, et le geste finalement choisi dépend d'un ordre de priorité fragile. Cela peut expliquer certaines confusions passées entre angles droits et diagonales.

## Cible : un seul moteur, une seule table
- **Un seul moteur de directions** : celui de la page (`lib/recognizer.js`). C'est déjà celui qui produit le bon format et que voient l'aperçu, l'appui long et Android.
- **Une seule table et une seule logique de correspondance** : `gestures.json` → la correspondance exacte puis approchée, faite dans l'arrière-plan, plus les gestes personnalisés.
- La page envoie à l'arrière-plan la **séquence déjà calculée**, en plus des points. Les points restent envoyés pour les traînées et le contexte. L'arrière-plan ne recalcule plus rien.
- On supprime le WebAssembly, son chargeur, la copie JS de secours, `ogc_vocab.h`/`ogc_recognizer.cpp`/`build-wasm.sh` et l'indice `vocabulary.js`.

## Garanties contre les régressions
- **Test de non-régression automatique avant toute suppression** :
  - On génère des tracés synthétiques pour chacun des 22 gestes, avec leurs alias et leurs variantes bruitées : petites déviations, gigue, tracés courts ou longs.
  - On les passe dans l'ancien circuit complet (ordre de priorité actuel) et dans le nouveau circuit, puis on compare l'action obtenue.
  - Tout écart est listé et analysé. Un écart n'est accepté que s'il corrige une confusion avérée (angle droit ou diagonale), et il vous est signalé.
- Les **appuis longs / répétitions**, les **gestes personnalisés** et le **seuil de sensibilité** gardent exactement les mêmes règles.
- **Android** : l'arbitrage tactile utilise déjà ce moteur, donc pas de changement.
- **Firefox (Windows, Mac, Android), Chrome, Edge, Opera, Brave** : le moteur unique est du JavaScript classique, sans chargement WebAssembly. On supprime donc aussi une source connue d'échecs au démarrage (type de fichier refusé, Android).
- Le test reste dans le projet pour protéger les évolutions futures.

## Étapes
1. Écrire le test comparatif ancien/nouveau circuit et le lancer sur la version actuelle (référence).
2. Faire envoyer la séquence calculée par la page, et faire utiliser à l'arrière-plan uniquement cette séquence avec la table `gestures.json` (exacte, personnalisée, puis approchée).
3. Retirer le WebAssembly, le moteur de secours, la table C++ et `vocabulary.js`. Mettre à jour les deux manifestes (bureau et Android) et le script `build-gesture-exports.mjs`.
4. Relancer le test comparatif et analyser les écarts éventuels.
5. Passer la version à 2.0.19 et reconstruire les 6 paquets : Firefox, Android, Chrome, Edge, Opera, Brave.
6. Sur la page Mémo, retirer les mentions éventuelles du « moteur C++/WebAssembly ».

## Détails techniques
- Message `ogc.stroke` : ajout de `sequence` (dashée). Côté service worker, on supprime `recognizeAction`, `OGC_WASM`, `preload()`, et `actionHint` devient inutile. Ordre conservé : custom → exacte → `findVocab` approchée. Le `actionHint` de l'appui long est remplacé par la même séquence.
- Fallback : si un ancien content script envoie un message sans `sequence`, on tokenise les points côté service worker avec le même code que `recognizer.js`, chargé via `importScripts`/scripts du manifest.
- Les fichiers web_accessible `wasm/*` sont retirés des manifestes.
