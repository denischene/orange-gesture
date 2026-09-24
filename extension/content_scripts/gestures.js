/* Gesture capture — long press fires while still holding the button. */
(function () {
  const LONG_PRESS_MS = 480;
  // Délai d'inactivité après l'appui : si l'utilisateur n'a pas commencé
  // de geste après ce délai, on annule le mode «capture de geste» pour
  // laisser le navigateur faire son travail standard (menu contextuel en
  // clic-droit, sélection texte en clic-gauche). Configurable via
  // settings.clickDelay (ms) : 500 / 1500 / 2000.
  const DEFAULT_IDLE_RELEASE_MS = 1500;

  const recognizer = new OGC_Recognizer();
  const points = [];
  let active = false;
  let suppressContext = false;
  let downTarget = null;
  let lastMoveAt = 0;
  let longPressTimer = null;
  let longPressFired = false;
  // Position du pointerdown ; sert à détecter si un véritable mouvement a
  // eu lieu pendant l'appui (et donc si on doit inhiber le menu contextuel).
  let downX = 0;
  let downY = 0;
  let movedDuringPress = false;
  const MOVE_THRESHOLD_PX = 5;
  let idleReleaseTimer = null;
  let idleReleased = false;
  // Android : les traits simples restent natifs. OGC ne capture le toucher
  // qu'après un changement de direction, ou pour un trait horizontal arrivé
  // au bord du contenu défilable.
  let multiTouchReleased = false;
  let androidGestureClaimed = false;
  let androidHorizontalAtEdge = false;
  // Après libération par timer en clic-gauche sur Chromium, on pilote
  // nous-mêmes la sélection texte car le moteur natif a été inhibé au
  // mousedown initial et ne se rallume pas tout seul.
  let manualSelect = false;
  let manualSelectAnchor = null; // { node, offset }
  const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "");
  const IS_FIREFOX = typeof navigator !== "undefined" && /Firefox/i.test(navigator.userAgent || "");
  const IS_ANDROID = !!(globalThis.OGC && globalThis.OGC.isAndroid);
  // Visible to the background: true tant que l'utilisateur maintient le
  // pointeur appuyé après le déclenchement initial du long-press.
  let longPressActive = false;
  // Premier hyperlien rencontré pendant le geste (au démarrage ou en cours).
  let firstLinkHref = null;
  // Sélection au moment du pointerdown : sur Chromium le clic droit peut
  // l'effacer immédiatement, on la fige donc dès le début du geste pour
  // que «Copier» et «Rechercher avec présélection» fonctionnent.
  let initialSelection = "";
  let initialEditable = false;
  // Élément focusé AU MOMENT du pointerdown : capturé avant que le clic
  // du geste ne déplace le focus vers <body>. Utilisé par les actions
  // « Élément suivant / précédent / Valider » pour reprendre au bon
  // endroit (y compris en répétition longue).
  let savedActiveElement = null;
  let settings = { enabled: true, button: 2, trails: true, tooltips: true, clickDelay: DEFAULT_IDLE_RELEASE_MS };

  browser.storage.local.get("settings").then((s) => {
    if (s.settings) settings = { ...settings, ...s.settings };
    // Sur Android, le bouton « droit » n'existe pas : on capte le doigt
    // (button === 0) quel que soit le réglage stocké.
    if (IS_ANDROID) settings.button = 0;
  });
  browser.storage.onChanged.addListener((changes) => {
    if (changes.settings) settings = { ...settings, ...changes.settings.newValue };
    if (IS_ANDROID) settings.button = 0;
  });

  // Le background interroge périodiquement l'onglet actif pour savoir si
  // l'appui long est toujours en cours avant de répéter l'action.
  // On utilise sendResponse + `return true` plutôt que de renvoyer une
  // Promise : c'est le seul motif fiable sur Chromium (Chrome, Edge, Opera,
  // Brave) — sur Edge en particulier, renvoyer une Promise depuis le
  // listener ne déclenche pas la réponse côté background.
  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "ogc.pingLongPress") {
      sendResponse({ active: longPressActive });
      return true;
    }
    if (msg?.type === "ogc.adoptLongPress") {
      active = true;
      longPressFired = true;
      longPressActive = true;
      sendResponse({ active: true });
      return true;
    }
    if (msg?.type === "ogc.toggleHelpPanel") {
      toggleHelpPanel();
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === "ogc.focusAction") {
      try { handleFocusAction(msg.kind); } catch (e) { console.warn("[OGC] focusAction failed", e); }
      sendResponse({ ok: true });
      return true;
    }
  });

  function focusableElements() {
    const sel = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),audio[controls],video[controls],[contenteditable=""],[contenteditable="true"],iframe,summary';
    const all = Array.from(document.querySelectorAll(sel));
    const visible = all.filter((el) => {
      if (el.disabled) return false;
      if (el.getAttribute("aria-hidden") === "true") return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") return false;
      return true;
    });
    visible.sort((a, b) => {
      const ta = parseInt(a.getAttribute("tabindex") || "0", 10);
      const tb = parseInt(b.getAttribute("tabindex") || "0", 10);
      if (ta > 0 && tb > 0 && ta !== tb) return ta - tb;
      if (ta > 0 && tb <= 0) return -1;
      if (tb > 0 && ta <= 0) return 1;
      const cmp = a.compareDocumentPosition(b);
      if (cmp & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (cmp & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
    return visible;
  }

  function handleFocusAction(kind) {
    if (kind === "activate") {
      const el = (savedActiveElement && savedActiveElement.isConnected) ? savedActiveElement
               : (document.activeElement && document.activeElement !== document.body ? document.activeElement : null);
      if (!el) return;
      const opts = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
      try { el.dispatchEvent(new KeyboardEvent("keydown", opts)); } catch {}
      try { el.dispatchEvent(new KeyboardEvent("keypress", opts)); } catch {}
      try { el.dispatchEvent(new KeyboardEvent("keyup", opts)); } catch {}
      try { if (typeof el.click === "function") el.click(); } catch {}
      return;
    }
    const visible = focusableElements();
    if (visible.length === 0) return;
    const dir = kind === "prev" ? -1 : +1;
    // Référence : élément focusé MÉMORISÉ au pointerdown, ou résultat de
    // notre précédent déplacement (qui s'auto-synchronise via setter).
    let ref = (savedActiveElement && savedActiveElement.isConnected) ? savedActiveElement : null;
    if (!ref && document.activeElement && document.activeElement !== document.body) {
      ref = document.activeElement;
    }
    let idx = ref ? visible.indexOf(ref) : -1;
    if (idx === -1) idx = dir > 0 ? -1 : visible.length;
    const n = visible.length;
    const next = visible[((idx + dir) % n + n) % n];
    try { next.focus({ preventScroll: false }); } catch { try { next.focus(); } catch {} }
    try { next.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); } catch {}
    paintFocusRing(next);
    // Mémorise pour la répétition (le geste est encore en cours, l'appui
    // long va re-déclencher cette action sans nouveau pointerdown).
    savedActiveElement = next;
  }

  // Peint un anneau de focus OGC (cadre noir épais + liseré blanc) sur
  // l'élément cible. La règle CSS est définie dans content_scripts/ogc.css.
  // Indépendant du style natif du site : visible sur fond clair et foncé,
  // et bien plus épais que la majorité des `:focus` par défaut.
  let lastFocusRingEl = null;
  let focusRingTimer = null;
  function paintFocusRing(el) {
    try {
      if (lastFocusRingEl && lastFocusRingEl !== el) {
        lastFocusRingEl.classList.remove("ogc-focus-ring");
      }
      lastFocusRingEl = el;
      el.classList.add("ogc-focus-ring");
      if (focusRingTimer) clearTimeout(focusRingTimer);
      // L'anneau persiste tant que l'utilisateur enchaîne avec
      // Élément suivant/précédent. Au bout de 6 s d'inactivité on
      // rend la main au style natif.
      focusRingTimer = setTimeout(() => {
        try { el.classList.remove("ogc-focus-ring"); } catch {}
        if (lastFocusRingEl === el) lastFocusRingEl = null;
      }, 6000);
    } catch {}
  }

  function stopLongPressRepeat() {
    const shouldNotify = longPressActive || longPressFired;
    longPressActive = false;
    if (shouldNotify) {
      browser.runtime.sendMessage({ type: "ogc.repeatStop" }).catch(() => {});
    }
  }

  function toggleHelpPanel() {
    const id = "__ogc_help_panel__";
    const existing = document.getElementById(id);
    if (existing) { existing.remove(); return; }
    const panel = document.createElement("div");
    panel.id = id;
    panel.style.cssText = [
      "position:fixed", "top:0", "right:0", "width:min(340px,90vw)",
      "height:100vh", "z-index:2147483647", "background:#fff",
      "box-shadow:-8px 0 24px rgba(0,0,0,.22)", "border-left:1px solid #ddd"
    ].join(";");
    const frame = document.createElement("iframe");
    frame.src = browser.runtime.getURL("sidebar/sidebar.html");
    frame.title = "OGC — Aide gestes";
    frame.style.cssText = "width:100%;height:100%;border:0;display:block";
    panel.appendChild(frame);
    document.documentElement.appendChild(panel);
  }

  function buildContext() {
    const liveSel = window.getSelection?.()?.toString?.() ?? "";
    const sel = liveSel || initialSelection || "";
    const link = downTarget?.closest?.("a[href]");
    const img  = downTarget?.closest?.("img[src]");
    const editable = initialEditable || !!downTarget?.closest?.(
      "input, textarea, [contenteditable=''], [contenteditable='true']"
    );
    return {
      selection: sel,
      // Priorité au 1er hyperlien franchi par le geste ; à défaut, celui
      // sous le point de départ.
      linkHref: firstLinkHref ?? link?.href ?? null,
      imageSrc: img?.src ?? null,
      inEditable: editable
    };
  }

  function captureLinkAt(x, y, fallbackTarget) {
    if (firstLinkHref) return;
    // On enquête sur TOUS les éléments empilés sous le pointeur (canvas
    // de tracé, tooltips OGC, overlays). Le premier qui possède un
    // ancêtre <a href> remporte le rôle de « premier lien franchi ».
    let stack = [];
    try {
      stack = document.elementsFromPoint?.(x, y) ?? [];
      if (!stack.length) {
        const el = document.elementFromPoint(x, y);
        if (el) stack = [el];
      }
    } catch {}
    if (fallbackTarget) stack.push(fallbackTarget);
    for (const el of stack) {
      const a = el?.closest?.("a[href]");
      if (a?.href) { firstLinkHref = a.href; return; }
    }
  }

  function clearTimers() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (idleReleaseTimer) { clearTimeout(idleReleaseTimer); idleReleaseTimer = null; }
  }

  // Bascule l'état OGC en mode «relâché» pour laisser la main au
  // navigateur (utilisé sur Android quand le geste est purement vertical).
  function releaseToNative() {
    active = false;
    clearTimers();
    restoreUserSelect();
    if (settings.trails) window.OGC_Trails?.end();
    window.OGC_Tooltips?.hide();
  }

  function horizontalScrollMargin(target, direction) {
    let el = target instanceof Element ? target : null;
    while (el && el !== document.documentElement) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll|overlay)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 4) {
        return direction === "L" ? el.scrollWidth - el.clientWidth - el.scrollLeft : el.scrollLeft;
      }
      el = el.parentElement;
    }
    const root = document.scrollingElement || document.documentElement;
    return direction === "L"
      ? Math.max(0, root.scrollWidth - root.clientWidth - root.scrollLeft)
      : Math.max(0, root.scrollLeft);
  }

  function androidShouldClaim(seq) {
    const tokens = seq.split("-").filter(Boolean);
    if (tokens.length > 1) {
      const first = tokens[0];
      return tokens.some((token) => token !== first);
    }
    if (seq === "L" || seq === "R") {
      androidHorizontalAtEdge = horizontalScrollMargin(downTarget, seq) < 80;
      return androidHorizontalAtEdge;
    }
    return false;
  }

  function scheduleLongPress() {
    clearTimers();
    longPressTimer = setTimeout(() => {
      if (!active) return;
      if (performance.now() - lastMoveAt < LONG_PRESS_MS - 20) return;
      const seq = recognizer.sequence();
      if (seq.length === 0) return;
      longPressFired = true;
      longPressActive = true;
      if (settings.tooltips) window.OGC_Tooltips?.show("⏷ " + seq);
      browser.runtime.sendMessage({
        type: "ogc.stroke",
        points: points.slice(),
        actionHint: window.OGC_VOCABULARY?.[seq] || null,
        context: { ...buildContext(), longPress: true }
      });
    }, LONG_PRESS_MS);
  }

  function scheduleIdleRelease(button) {
    if (idleReleaseTimer) clearTimeout(idleReleaseTimer);
    const delay = Number(settings.clickDelay) > 0 ? Number(settings.clickDelay) : DEFAULT_IDLE_RELEASE_MS;
    idleReleaseTimer = setTimeout(() => {
      if (!active || movedDuringPress) return;
      // L'utilisateur a marqué un temps d'arrêt sans déclencher de geste :
      // on sort du mode capture pour rendre la main au navigateur.
      idleReleased = true;
      active = false;
      clearTimers();
      restoreUserSelect();
      if (settings.trails) window.OGC_Trails?.end();
      window.OGC_Tooltips?.hide();
      if (button === 2) {
        // Clic-droit maintenu sans geste : on autorise / on rejoue le
        // menu contextuel.
        suppressContext = false;
        if (IS_MAC) {
          try {
            const evt = new MouseEvent("contextmenu", {
              bubbles: true, cancelable: true, view: window,
              clientX: downX, clientY: downY,
              button: 2, buttons: 0,
            });
            (downTarget || document.documentElement).dispatchEvent(evt);
          } catch {}
        }
      }
      // En clic-gauche, on amorce une sélection manuelle pilotée via
      // l'API Selection : sur Chromium, le moteur natif a été désactivé
      // par le preventDefault('selectstart') initial et il ne se
      // rallume pas tant que le bouton n'est pas relâché.
      if (button === 0) {
        manualSelect = true;
        // L'ancre sera calculée au point courant si non disponible ici
        // (cas où le pointeur initial n'est pas sur un nœud texte) — sur
        // Edge en particulier, le moteur natif refuse de redémarrer une
        // sélection tant que le bouton n'est pas relâché : on la pilote
        // donc systématiquement nous-mêmes via l'API Selection.
        manualSelectAnchor = caretAt(downX, downY);
        try {
          const sel = window.getSelection?.();
          if (sel) {
            sel.removeAllRanges();
            if (manualSelectAnchor) {
              const r = document.createRange();
              r.setStart(manualSelectAnchor.node, manualSelectAnchor.offset);
              r.setEnd(manualSelectAnchor.node, manualSelectAnchor.offset);
              sel.addRange(r);
            }
          }
        } catch {}
      }
    }, delay);
  }

  // Renvoie {node, offset} du caret texte le plus proche de (x,y),
  // compatible Firefox (caretPositionFromPoint) et Chromium/WebKit
  // (caretRangeFromPoint).
  function caretAt(x, y) {
    try {
      if (document.caretPositionFromPoint) {
        const p = document.caretPositionFromPoint(x, y);
        if (p) return { node: p.offsetNode, offset: p.offset };
      }
      if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(x, y);
        if (r) return { node: r.startContainer, offset: r.startOffset };
      }
    } catch {}
    return null;
  }

  function onDown(e) {
    if (!settings.enabled) return;
    // Android (tactile) : on accepte uniquement les pointeurs « touch »
    // (button === 0). Desktop : on respecte le réglage utilisateur.
    if (IS_ANDROID) {
      if (e.pointerType !== "touch") return;
    } else if (e.button !== settings.button) {
      return;
    }
    multiTouchReleased = false;
    androidGestureClaimed = false;
    androidHorizontalAtEdge = false;
    // Stratégie : ne RIEN bloquer tant qu'aucun geste n'est détecté, afin
    // de préserver le comportement natif du clic (focus d'un champ, début
    // de sélection texte, menu contextuel) tant que l'utilisateur ne
    // commence pas à dessiner. On bascule en mode «capture de geste» (et
    // on inhibe sélection / menu) seulement au premier déplacement
    // significatif, dans onMove(). Seule exception : Firefox macOS livre
    // le `contextmenu` de façon synchrone sur le pointerdown du clic
    // droit ; on doit donc preventDefault dès maintenant pour le
    // suspendre, quitte à le rejouer dans onUp si aucun geste ne suit.
    suppressContext = false;
    movedDuringPress = false;
    idleReleased = false;
    if (e.button === 2 && IS_MAC) {
      try { e.preventDefault(); } catch {}
    }
    active = true;
    longPressFired = false;
    longPressActive = false;
    downTarget = e.target;
    downX = e.clientX;
    downY = e.clientY;
    firstLinkHref = null;
    try { initialSelection = window.getSelection?.()?.toString?.() ?? ""; }
    catch { initialSelection = ""; }
    initialEditable = !!e.target?.closest?.(
      "input, textarea, [contenteditable=''], [contenteditable='true']"
    );
    // Mémorise le focus AVANT que le clic du geste ne le déplace vers
    // <body>. On garde le précédent si l'élément actif est déjà <body>.
    try {
      const ae = document.activeElement;
      if (ae && ae !== document.body && ae !== document.documentElement) {
        savedActiveElement = ae;
      }
    } catch {}
    recognizer.reset();
    points.length = 0;
    points.push([e.clientX, e.clientY]);
    recognizer.addPoint(e.clientX, e.clientY);
    captureLinkAt(e.clientX, e.clientY, e.target);
    lastMoveAt = performance.now();
    if (settings.trails) window.OGC_Trails?.start(e.clientX, e.clientY);
    window.OGC_Tooltips?.show("");
    scheduleIdleRelease(e.button);
  }

  // Android — laisse les traits simples au navigateur et ne bloque que les
  // tracés complexes effectivement revendiqués par OGC.
  function onAndroidTouchMove(e) {
    if (!IS_ANDROID) return;
    if (e.touches && e.touches.length > 1 && !multiTouchReleased) {
      multiTouchReleased = true;
      releaseToNative();
      return;
    }
    if (!active || multiTouchReleased || !androidGestureClaimed) return;
    try { e.preventDefault(); } catch {}
  }

  function onMove(e) {
    if (!active) {
      if (manualSelect) {
        // Sur Chromium/Edge, le drag natif est bloqué par notre
        // selectstart preventDefault initial. On empêche aussi tout
        // comportement natif parasite (image drag, autoscroll) pendant
        // qu'on étend la sélection à la main.
        try { e.preventDefault(); } catch {}
        const focus = caretAt(e.clientX, e.clientY);
        if (focus) {
          if (!manualSelectAnchor) manualSelectAnchor = focus;
          try {
            const sel = window.getSelection?.();
            if (sel) {
              sel.setBaseAndExtent(
                manualSelectAnchor.node, manualSelectAnchor.offset,
                focus.node, focus.offset
              );
            }
          } catch {}
        }
      }
      return;
    }
    if (idleReleaseTimer && !movedDuringPress) {
      // Tant qu'il n'y a pas eu de déplacement significatif, on garde
      // la fenêtre d'inactivité ouverte.
    }
    if (!movedDuringPress) {
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (dx*dx + dy*dy >= MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX) {
        movedDuringPress = true;
        if (idleReleaseTimer) { clearTimeout(idleReleaseTimer); idleReleaseTimer = null; }
        // Mouvement réel → on bascule en mode «capture de geste».
        // - Inhibe le menu contextuel (pointerup sur Win/Linux, déjà
        //   suspendu sur Mac).
        // - Pose user-select:none pour que Firefox / WebKit n'étendent
        //   pas une sélection texte pendant le tracé.
        // - Vide toute sélection déjà commencée par le tout début du
        //   drag natif (sauf dans un champ éditable).
        suppressContext = true;
        try {
          const de = document.documentElement;
          if (de && !de.hasAttribute("data-ogc-prev-userselect")) {
            de.setAttribute("data-ogc-prev-userselect", de.style.userSelect || "");
            de.style.userSelect = "none";
            de.style.webkitUserSelect = "none";
            de.style.MozUserSelect = "none";
          }
        } catch {}
        // Ne JAMAIS effacer une sélection préexistante : l'utilisateur
        // peut s'en servir comme entrée pour « Copier » ou « Rechercher
        // sur internet » (search.web). Si rien n'était sélectionné à
        // l'appui, on nettoie l'amorce parasite que le drag natif aurait
        // pu produire (hors champ éditable).
        if (!initialSelection) {
          try {
            const s = window.getSelection?.();
            if (s && s.rangeCount && !initialEditable) s.removeAllRanges();
          } catch {}
        }
      }
    }
    if (movedDuringPress) {
      // Pendant le tracé : on annule l'extension native de la sélection
      // et le drag d'images / liens.
      if (!IS_ANDROID || androidGestureClaimed) {
        try { e.preventDefault(); } catch {}
      }
      if (!initialSelection) {
        try {
          const s = window.getSelection?.();
          if (s && s.rangeCount && !initialEditable) s.removeAllRanges();
        } catch {}
      }
    } else {
      // Pas (encore) de geste : on ne touche à rien — le navigateur peut
      // démarrer une sélection texte ou placer le caret normalement.
      return;
    }
    points.push([e.clientX, e.clientY]);
    recognizer.addPoint(e.clientX, e.clientY);
    captureLinkAt(e.clientX, e.clientY, e.target);
    lastMoveAt = performance.now();
    if (longPressFired) { clearTimers(); return; }
    scheduleLongPress();
    if (settings.trails) window.OGC_Trails?.lineTo(e.clientX, e.clientY);
    const seq = recognizer.sequence();
    if (IS_ANDROID && !androidGestureClaimed && androidShouldClaim(seq)) {
      androidGestureClaimed = true;
      suppressContext = true;
    }
    if (settings.tooltips) window.OGC_Tooltips?.show(seq);
  }

  function onUp(e) {
    if (manualSelect) {
      manualSelect = false;
      manualSelectAnchor = null;
    }
    if (idleReleased) {
      idleReleased = false;
      stopLongPressRepeat();
      return;
    }
    if (!active) { stopLongPressRepeat(); return; }
    active = false;
    clearTimers();
    restoreUserSelect();
    const previewSeq = recognizer.sequence();
    if (settings.trails) window.OGC_Trails?.end();
    setTimeout(() => window.OGC_Tooltips?.hide(), 1500);
    if (longPressFired) stopLongPressRepeat();
    // Clic droit nu (aucun déplacement) → on laisse / on rejoue le menu
    // contextuel système.
    if (e.button === 2 && !movedDuringPress && previewSeq.length === 0) {
      suppressContext = false;
      if (IS_MAC) {
        // Sur Firefox macOS le contextmenu d'origine a été inhibé par le
        // preventDefault du pointerdown ; on en rejoue un sur la cible.
        try {
          const evt = new MouseEvent("contextmenu", {
            bubbles: true, cancelable: true, view: window,
            clientX: e.clientX, clientY: e.clientY,
            screenX: e.screenX, screenY: e.screenY,
            button: 2, buttons: 0,
          });
          (e.target || downTarget || document.documentElement).dispatchEvent(evt);
        } catch {}
      }
      return;
    }
    const androidContextAction =
      (previewSeq === "U" && initialSelection.trim().length > 0) ||
      (previewSeq === "D" && initialEditable);
    const androidMayRun = !IS_ANDROID || longPressFired || androidGestureClaimed || androidContextAction;
    if (previewSeq.length > 0 && androidMayRun) {
      suppressContext = true;
      e.preventDefault();
      if (longPressFired) return;
      // Tous navigateurs : la fin du geste (pointerup) peut effacer la
      // sélection courante (Gecko le fait systématiquement, Chromium
      // selon les pages). On la sauvegarde AVANT d'envoyer le message
      // d'action et on la ré-applique après pour que « Copier » et
      // « Rechercher avec présélection » conservent un retour visuel
      // clair jusqu'à l'aboutissement.
      let savedRanges = null;
      try {
        const sel = window.getSelection?.();
        if (sel && sel.rangeCount && (sel.toString() || "").length > 0) {
          savedRanges = [];
          for (let i = 0; i < sel.rangeCount; i++) {
            savedRanges.push(sel.getRangeAt(i).cloneRange());
          }
        }
      } catch {}
      browser.runtime.sendMessage({
        type: "ogc.stroke",
        points: points.slice(),
        actionHint: window.OGC_VOCABULARY?.[previewSeq] || null,
        context: { ...buildContext(), longPress: false }
      });
      if (savedRanges) {
        const restore = () => {
          try {
            const sel = window.getSelection?.();
            if (!sel) return;
            sel.removeAllRanges();
            for (const r of savedRanges) sel.addRange(r);
          } catch {}
        };
        // Plusieurs tentatives échelonnées : la sélection peut être
        // effacée à différents instants selon le navigateur et la voie
        // utilisée par l'action (clipboard.writeText vs execCommand).
        requestAnimationFrame(restore);
        setTimeout(restore, 60);
        setTimeout(restore, 200);
        setTimeout(restore, 600);
      }
    }
  }

  function onContext(e) {
    if (suppressContext) { e.preventDefault(); suppressContext = false; }
  }

  function restoreUserSelect() {
    try {
      const de = document.documentElement;
      if (de && de.hasAttribute("data-ogc-prev-userselect")) {
        const prev = de.getAttribute("data-ogc-prev-userselect") || "";
        de.style.userSelect = prev;
        de.style.webkitUserSelect = prev;
        de.style.MozUserSelect = prev;
        de.removeAttribute("data-ogc-prev-userselect");
      }
      if (de && de.hasAttribute("data-ogc-prev-touchaction")) {
        const prev = de.getAttribute("data-ogc-prev-touchaction") || "";
        de.style.touchAction = prev;
        de.removeAttribute("data-ogc-prev-touchaction");
      }
    } catch {}
  }

  window.addEventListener("pointerdown", onDown, true);
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  // Décideur tactile Android, branché en non-passif au plus tôt.
  if (IS_ANDROID) {
    window.addEventListener("touchmove", onAndroidTouchMove, { passive: false, capture: true });
    window.addEventListener("touchend", stopLongPressRepeat, { passive: true, capture: true });
    window.addEventListener("touchcancel", stopLongPressRepeat, { passive: true, capture: true });
  }
  // Permet au panneau d'aide injecté (iframe sidebar) de demander sa
  // fermeture via postMessage("ogc.closeHelpPanel", "*").
  window.addEventListener("message", (ev) => {
    if (ev?.data === "ogc.closeHelpPanel") {
      const p = document.getElementById("__ogc_help_panel__");
      if (p) p.remove();
    }
  });
  // Bloque le drag natif d'images / liens / texte sélectionné pendant un
  // geste clic-gauche.
  window.addEventListener("dragstart", (e) => {
    if (active) { try { e.preventDefault(); } catch {} }
  }, true);
  // Sur Chromium (Chrome, Edge, Opera, Brave) le `user-select:none` posé
  // dans onMove() arrive TROP TARD : la sélection a déjà commencé sur le
  // mousedown et le moteur ne l'annule plus. On bloque donc `selectstart`
  // tant que `active === true` (le bouton est encore appuyé en mode
  // capture). Cas non impactés :
  //   • Clic simple sans déplacement pour placer le caret dans un champ :
  //     `selectstart` n'est pas émis dans ce cas.
  //   • Sélection après temporisation de 1,5 s : `scheduleIdleRelease()`
  //     remet `active = false`, donc le `selectstart` suivant passe.
  window.addEventListener("selectstart", (e) => {
    if (active && !idleReleased) {
      try { e.preventDefault(); } catch {}
    }
  }, true);
  window.addEventListener("pointercancel", () => {
    if (!active) { stopLongPressRepeat(); return; }
    active = false; clearTimers(); restoreUserSelect(); stopLongPressRepeat();
  }, true);
  window.addEventListener("blur", () => {
    active = false;
    clearTimers();
    restoreUserSelect();
  });
  window.addEventListener("contextmenu", onContext, true);
})();