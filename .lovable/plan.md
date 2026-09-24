# Plan — Mobile, site statique, gestes tactiles

## 1. Mémo des gestes : version mobile
- Détection mobile (tactile + largeur < 768 px, via `pointer: coarse`) côté page.
- Vignettes grisées + mention « Inactif sur mobile » : Agrandir fenêtre, Réduire fenêtre.
- Vignettes non grisées mais libellés ajustés :
  - Descendre / Monter : pictos et libellés intervertis sur mobile, car le geste tactile déplace naturellement la page dans le sens inverse. Les traits simples utilisent le défilement tactile natif ; les appuis longs répétés restent des commandes OGC, elles aussi inversées. « Descendre dans un champ : Coller » et « Monter sur sélection : Copier » restent actifs.
  - Haut de page / Bas de page : pictos intervertis et libellés inversés (le geste montant mène en bas, le geste descendant mène en haut — logique « on tire la page »).
  - Zoomer / Dézoomer : nouveaux pictos (pincement, d'après les images fournies), redessinés en noir épais comme les autres, sans point orange, avec animation curseur ; mention « geste natif du navigateur ».
- Même adaptation dans le panneau Aide gestes de la version Android de l'extension.
- Extension Android : Haut/Bas de page exécutent la commande inverse.

## 2. Site de présentation statique + ZIP automatique
- Prérendu de toutes les pages (Accueil, Mémo, Aide, Installation) en HTML statique à la construction, sans dépendance serveur.
- Workflow GitHub Actions (`.github/workflows/static-site.yml`) : à chaque push, installation, construction, puis création de `ogc-site-static.zip` publié comme artefact téléchargeable (et en « release » optionnelle), prêt à déposer sur OVH par FTP.

## 3. Mobile : ascenseur horizontal vs Page précédente/suivante
- Au début d'un geste horizontal simple, mesure de la marge de défilement disponible dans le sens du geste.
- Si la marge restante est inférieure à un seuil (~80 px, équivalent d'un mot / demi-bouton) ou si la page est déjà en butée : commande OGC (page précédente/suivante).
- Sinon : défilement natif ; le geste suivant, une fois en butée, déclenche la commande OGC.

## 4. Mobile : ne plus annuler le geste quand la page défile
- Laisser le défilement natif démarrer (plus de blocage systématique au premier contact).
- Continuer à enregistrer le tracé pendant le défilement (coordonnées écran).
- Dès qu'un changement de direction est détecté (geste plus complexe qu'un trait droit), bloquer le défilement (`preventDefault` sur `touchmove`), poursuivre le tracé, reconnaître et exécuter la commande.
- Un simple trait haut/bas/gauche/droite reste un défilement natif.
- Remplace la règle actuelle « un second doigt pour défiler ».

## 5. Page d'accueil du site puis « Avancer » : solution proposée
Problème : le retour à la racine est une nouvelle navigation, donc « Avancer » ne mène nulle part.
Solution proposée : OGC mémorise, pour chaque onglet, l'adresse quittée lors de la commande Page d'accueil. Si le geste Page suivante est fait juste après et que le navigateur ne peut pas avancer, OGC rouvre cette adresse mémorisée. La mémoire est effacée dès que l'utilisateur navigue ailleurs. Fonctionne sur toutes les versions.

## 6. Mobile : Page précédente répétée trop de fois
- Déclenchement de l'appui long plus rapide sur tactile (~500 ms au lieu du délai actuel).
- Répétitions uniquement pendant l'appui : arrêt immédiat au relâchement du doigt (`pointerup`/`touchend`/`touchcancel`), avec annulation des répétitions en attente côté arrière-plan.
- Correction du bug : la boucle de répétition n'attend plus la fin des navigations en file ; un jeton de répétition est invalidé au relâchement.

## Technique
- Fichiers : `src/routes/memo.tsx`, `src/styles.css`, nouveaux `public/img/zoom_mobile*.png/gif`, `extension/content_scripts/gestures.js`, `extension/background/service_worker.js`, `extension/sidebar/sidebar.js`, `vite.config.ts` (prerender des 4 routes, `autoStaticPathsDiscovery: false`), `.github/workflows/static-site.yml`.
- Reconstruction de tous les paquets d'extension.
