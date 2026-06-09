// Ordre et libellés imposés par la spec.
const ITEMS = [
  { img: "interogation",           lbl: "aide" },
  { img: "top_bottom",             lbl: "descendre" },
  { img: "bottom_top",             lbl: "monter" },
  { img: "down_right_angle",       lbl: "bas page" },
  { img: "up_right_angle",         lbl: "haut page" },
  { img: "right_left",             lbl: "page prcdte" },
  { img: "left_right",             lbl: "page suiv." },
  { img: "accueil",                lbl: "accueil" },
  { img: "clockwise_circle",       lbl: "zoomer" },
  { img: "anticlockwise_circle",   lbl: "dézoomer" },
  { img: "bottom_left_top_right",  lbl: "agrandir" },
  { img: "top_right_bottom_left",  lbl: "réduire" },
  { img: "right_left_arch",        lbl: "onglet prcdt." },
  { img: "left_right_arch",        lbl: "onglet suiv." },
  { img: "top_down_arch",          lbl: "nouv. onglet" },
  { img: "alpha",                  lbl: "fermer" },
  { img: "magnifying_glass",       lbl: "rechercher" },
  { img: "left_right_heart",       lbl: "+favoris" },
  { img: "vertical_ribbon",        lbl: "enregistrer" },
  { img: "element_next",           lbl: "élt suiv." },
  { img: "element_prev",           lbl: "élt prcdt." },
  { img: "validate",               lbl: "valider" }
];
const grid = document.getElementById("grid");
const preview = document.getElementById("preview");
let activeCell = null;
function showPreview(name, lbl) {
  preview.innerHTML = "";
  const img = document.createElement("img");
  // Cache-bust pour forcer un nouveau cycle d'animation à chaque clic.
  img.src = "../img/" + name + ".gif?t=" + Date.now();
  img.alt = lbl;
  img.onerror = () => { img.src = "../img/" + name + ".png"; };
  const label = document.createElement("div");
  label.className = "label";
  label.textContent = lbl;
  preview.appendChild(img);
  preview.appendChild(label);
}
for (const it of ITEMS) {
  const c = document.createElement("button");
  c.type = "button";
  c.className = "cell";
  c.setAttribute("aria-label", it.lbl);
  const img = document.createElement("img");
  img.src = "../img/" + it.img + ".png";
  img.alt = "";
  img.onerror = () => { img.style.display = "none"; };
  const l = document.createElement("div");
  l.className = "lbl";
  l.textContent = it.lbl;
  c.appendChild(img);
  c.appendChild(l);
  c.addEventListener("click", () => {
    if (activeCell) activeCell.classList.remove("active");
    c.classList.add("active");
    activeCell = c;
    showPreview(it.img, it.lbl);
  });
  grid.appendChild(c);
}
// Place le focus sur la première cellule (Aide) à l'ouverture du panneau.
const firstCell = grid.querySelector(".cell");
if (firstCell) {
  // requestAnimationFrame pour s'assurer que l'iframe est bien rendue
  // avant de tenter le focus (sinon Firefox l'ignore parfois).
  requestAnimationFrame(() => {
    try { firstCell.focus(); } catch {}
  });
}
