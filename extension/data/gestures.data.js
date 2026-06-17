// AUTO-GÉNÉRÉ par scripts/build-gesture-exports.mjs — ne pas éditer.
// Source : extension/data/gestures.json
globalThis.OGC_GESTURES_DATA = {
  "version": "2.0.0",
  "description": "Orange Gesture Control — vocabulaire des gestes (source unique de vérité). Tout dérivé : runtime JS, en-tête C++ embarqué dans le WASM, exports publics JSON et RDF.",
  "directions": [
    "R",
    "UR",
    "U",
    "UL",
    "L",
    "DL",
    "D",
    "DR"
  ],
  "gestures": [
    {
      "id": "page.back",
      "label": "Page précédente",
      "longLabel": "Page précédente (répété)",
      "repeat": true,
      "canonical": "L",
      "aliases": []
    },
    {
      "id": "page.forward",
      "label": "Page suivante",
      "longLabel": "Page suivante (répété)",
      "repeat": true,
      "canonical": "R",
      "aliases": []
    },
    {
      "id": "scroll.up",
      "label": "Monter",
      "longLabel": "Monter (répété)",
      "repeat": true,
      "canonical": "U",
      "aliases": []
    },
    {
      "id": "scroll.down",
      "label": "Descendre",
      "longLabel": "Descendre (répété)",
      "repeat": true,
      "canonical": "D",
      "aliases": []
    },
    {
      "id": "page.top",
      "label": "Haut de page",
      "canonical": "UUR",
      "aliases": [
        "URR",
        "UURR",
        "UUUR",
        "URRR",
        "UUURR",
        "UURRR",
        "UUL",
        "ULL",
        "UULL",
        "UUUL",
        "ULLL",
        "UUULL",
        "UULLL"
      ]
    },
    {
      "id": "page.bottom",
      "label": "Bas de page",
      "canonical": "DDR",
      "aliases": [
        "DRR",
        "DDRR",
        "DDDR",
        "DRRR",
        "DDDRR",
        "DDRRR",
        "DDL",
        "DLL",
        "DDLL",
        "DDDL",
        "DLLL",
        "DDDLL",
        "DDLLL"
      ]
    },
    {
      "id": "site.home",
      "label": "Accueil du site",
      "longLabel": "Accueil du navigateur",
      "canonical": "LURDR",
      "aliases": []
    },
    {
      "id": "search.web",
      "label": "Rechercher sur internet",
      "longLabel": "Rechercher dans la page",
      "canonical": "URUURRDLDDL",
      "aliases": []
    },
    {
      "id": "help.toggle",
      "label": "Aide",
      "canonical": "UURRDDLDD",
      "aliases": []
    },
    {
      "id": "tab.new",
      "label": "Nouvel onglet",
      "canonical": "DUURRDRD",
      "aliases": [
        "DUURRDR",
        "DUURDRD",
        "DUURRDRR"
      ]
    },
    {
      "id": "tab.next",
      "label": "Onglet suivant",
      "longLabel": "Onglet suivant (répété)",
      "repeat": true,
      "canonical": "URRDRD",
      "aliases": [
        "UURRDR",
        "UURRDRD",
        "UURDRD",
        "UURRDRR"
      ]
    },
    {
      "id": "tab.prev",
      "label": "Onglet précédent",
      "longLabel": "Onglet précédent (répété)",
      "repeat": true,
      "canonical": "UULLDLD",
      "aliases": [
        "UULDLD",
        "UULLDL",
        "UULLDLL"
      ]
    },
    {
      "id": "tab.close",
      "label": "Fermer l'onglet",
      "longLabel": "Fermer l'onglet (répété)",
      "repeat": true,
      "canonical": "DRULDR",
      "aliases": [
        "DLULLUURRDR",
        "DLLULLUURDR",
        "DLLULLUURRDR",
        "DDLLULLUURRDR"
      ]
    },
    {
      "id": "window.maximize",
      "label": "Agrandir la fenêtre",
      "longLabel": "État fenêtre suivant",
      "repeat": true,
      "canonical": "UR",
      "aliases": []
    },
    {
      "id": "window.minimize",
      "label": "Réduire la fenêtre",
      "longLabel": "État fenêtre précédent",
      "repeat": true,
      "canonical": "DL",
      "aliases": []
    },
    {
      "id": "zoom.in",
      "label": "Zoomer",
      "longLabel": "Zoom progressif",
      "repeat": true,
      "canonical": "DRDDLLLUURUR",
      "aliases": []
    },
    {
      "id": "zoom.out",
      "label": "Dézoomer",
      "longLabel": "Dézoom progressif",
      "repeat": true,
      "canonical": "LDLDDRRULUUL",
      "aliases": []
    },
    {
      "id": "bookmarks.add",
      "label": "Ajouter aux favoris",
      "canonical": "LRULRD",
      "aliases": [
        "RURRDR",
        "RURDDR",
        "RURDLDR",
        "RURDR",
        "RURDDRR",
        "RURUDDRR",
        "URUDDRR"
      ]
    },
    {
      "id": "page.saveAs",
      "label": "Enregistrer sous…",
      "canonical": "DDRURUULL",
      "aliases": [
        "DDRRURULLL",
        "DDRRURULL",
        "DDRRURUUUL"
      ]
    },
    {
      "id": "element.next",
      "label": "Élément suivant",
      "longLabel": "Élément suivant (répété)",
      "repeat": true,
      "canonical": "RD",
      "aliases": [
        "RDD",
        "RRD",
        "RRDD",
        "RDRD",
        "RDRDD",
        "RDRRD"
      ]
    },
    {
      "id": "element.prev",
      "label": "Élément précédent",
      "longLabel": "Élément précédent (répété)",
      "repeat": true,
      "canonical": "LD",
      "aliases": [
        "LDD",
        "LLD",
        "LLDD",
        "LU",
        "LUU",
        "LLU",
        "LLUU",
        "LDLD",
        "LDLDD",
        "LDLLD",
        "LULU",
        "LULUU"
      ]
    },
    {
      "id": "element.activate",
      "label": "Valider",
      "canonical": "DRUR",
      "aliases": [
        "DDRUR",
        "DRRUR",
        "DRURR",
        "DRUUR",
        "DDRUUR",
        "DRRUUR",
        "DDRRUR",
        "DDRRUUR"
      ]
    }
  ]
};
