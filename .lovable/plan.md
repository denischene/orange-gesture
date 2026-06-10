## Objectif

Faire fonctionner Orange Gesture Control sur **Firefox pour Android** (Fenix), en complément des versions desktop déjà packagées (`ogc.xpi`).

## Contraintes Firefox Android (à connaître)

Firefox Android exécute des WebExtensions, mais avec un sous-ensemble limité :

- **Pas de souris** : les gestes doivent être déclenchés au doigt (Pointer Events `touch`) plutôt qu’à `mousedown`/`contextmenu`.
- **Pas de `browserAction.default_popup`** : le popup ne s’affiche pas comme sur desktop. Il faut basculer vers une page d’options accessible depuis le menu Firefox.
- **Pas de `sidebar_action`** : la sidebar n’existe pas. L’aide doit s’ouvrir comme overlay in-page (déjà géré par `help.toggle`) ou comme onglet dédié.
- **Pas de `contextMenus`** sur Fenix actuel : à retirer ou rendre conditionnel.
- **Pas de raccourcis `commands`** liés au clavier matériel.
- **`tabs.create` / `tabs.update`** : OK ; pas de fenêtres multiples (`windows.*` largement absent → `window.maximize`/`minimize` ne fonctionneront pas, désactiver ou remapper).
- **Distribution** : Firefox Android n’installe que les extensions signées via AMO ou via la « Collection de modules complémentaires personnalisée » (Nightly). Le `.xpi` actuel doit être soumis à AMO pour être installable sur Fenix stable.
- **Manifest** : Fenix supporte MV3 depuis Firefox 120, mais le `background.service_worker` n’est pas exécuté ; on garde `background.scripts` (event page) — déjà présent dans `manifest.json`.

## Plan d’implémentation

### 1. Détection plateforme

Dans `extension/lib/compat.js`, ajouter :
```js
OGC.isAndroid = /Android/i.test(navigator.userAgent);
OGC.isFenix   = OGC.isAndroid && typeof browser !== "undefined";
```
Exposer un flag global utilisé par tous les modules.

### 2. Manifest dédié Android

Créer `extension/manifest.android.json` (variante générée au build) :
- Retirer `sidebar_action`, `contextMenus` (permission), `commands`.
- Conserver `background.scripts` (event page) uniquement.
- `action` sans `default_popup` (le clic ouvre la page d’options en plein écran).
- `strict_min_version` Gecko : `"120.0"`.
- `browser_specific_settings.gecko_android` : `{ "strict_min_version": "120.0" }`.

Adapter `scripts/build-gesture-exports.mjs` (ou nouveau script `scripts/package-extensions.mjs`) pour produire `public/ogc-android.xpi` avec ce manifest.

### 3. Entrées tactiles

Dans `extension/content_scripts/gestures.js` :
- Ajouter écouteurs `pointerdown`/`pointermove`/`pointerup` avec `pointerType === "touch"`.
- Sur Android, déclencheur = **appui long à un doigt** (équivalent du clic-maintenu). Timer paramétrable (réutiliser le réglage « Action du clic avant le geste »).
- Désactiver la détection `contextmenu` (inutile sur tactile).
- Empêcher le scroll natif pendant un geste actif via `touch-action: none` ajouté dynamiquement à l’élément racine lorsque le geste démarre.

### 4. Adaptation UI

- **Popup** : sur Android, `browser.action.onClicked` ouvre `options/options.html` dans un nouvel onglet (au lieu du popup). Ajouter listener conditionnel dans `service_worker.js`.
- **Sidebar Aide** : remplacer par un overlay plein écran injecté dans la page courante (déjà la stratégie pour `help.toggle` → vérifier qu’elle fonctionne sans `sidebar_action`).
- **Page Options** : passer en layout responsive (colonnes empilées sous 600 px) dans `extension/options/options.css`.

### 5. Désactivation des gestes non supportés

Dans `service_worker.js`, si `OGC.isAndroid` :
- `window.maximize` / `window.minimize` → no-op + toast « Indisponible sur Android ».
- `tab.close`, `tab.new`, `tab.next`, `tab.prev`, `page.back`, `page.forward`, `scroll.*`, `page.top`, `page.bottom`, `bookmarks.add`, `site.home`, `search.web`, `help.toggle`, `element.*`, `page.saveAs` → tous testés ; ajuster ceux qui échouent.

### 6. Packaging & distribution

- Construire `public/ogc-android.xpi` (signé via `web-ext sign` lors d’une étape manuelle hors-build automatique).
- Mettre à jour la page **Installation** (`src/routes/tutorials.tsx`) avec une section dédiée Firefox Android :
  - Lien de téléchargement direct (Nightly + collection personnalisée).
  - Étapes : activer le débogage USB, ajouter la collection AMO, installer.
  - Note : version stable nécessite publication AMO.
- Mettre à jour la page **Accueil** pour mentionner « Firefox Android (beta) ».

### 7. Tests

- Vérifier sur Firefox Nightly Android avec `web-ext run --target firefox-android` (manuel, hors sandbox).
- Smoke test : gestes simples (L, R, U, D), gestes composés (UUR, DRUR), aide.

## Livrables

- `extension/manifest.android.json`
- Modifications dans `compat.js`, `gestures.js`, `service_worker.js`, `options.css`
- `scripts/package-extensions.mjs` (nouveau) pour automatiser le packaging des 6 cibles
- `public/ogc-android.xpi`
- Section Android dans `src/routes/tutorials.tsx` + bouton de téléchargement
- Mise à jour `src/components/download-button.tsx` pour exposer la variante Android

## Hors-scope

- Signature AMO (manuelle, hors sandbox)
- Support Chrome/Edge Android (non disponible pour les extensions tierces)
- Support iOS (les WebExtensions Safari nécessitent un binaire Xcode séparé)
