import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";

export const Route = createFileRoute("/memo")({
  component: Memo,
  head: () => ({
    meta: [
      { title: "Mémo des gestes — Orange Gesture Control" },
      {
        name: "description",
        content:
          "Vocabulaire des 22 gestes reconnus par Orange Gesture Control, avec illustration animée et fonction d'appui long.",
      },
      { property: "og:title", content: "Mémo des gestes — Orange Gesture Control" },
      { property: "og:description", content: "Les 22 gestes Orange Gesture Control et leurs commandes, sur ordinateur et mobile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type DotPos =
  | "top" | "bottom" | "left" | "right"
  | "top-right" | "top-left" | "bottom-right" | "bottom-left"
  | "none";

type Gesture = {
  name: string;
  title: string;
  longTitle?: string;
  sequence: string;
  dot: DotPos;
  note?: string;
  custom?: "home" | "newtab"; // inline SVG instead of png/gif
  alt?: string;
  inactiveOnMobile?: boolean;
};

const GESTURES: Gesture[] = [
  { name: "interogation",          title: "Aide",                          sequence: "UURRDDLDD",                                              dot: "none", alt: "Aide = geste point d’interrogation" },
  { name: "top_bottom",            title: "Descendre",                     longTitle: "Descendre (répété)",           sequence: "D",            dot: "bottom", note: "Dans un champ : Coller", alt: "Descendre dans la page = geste trait vers le bas. Depuis un champ de saisi, exécute à la place la fonction coller" },
  { name: "bottom_top",            title: "Monter",                        longTitle: "Monter (répété)",              sequence: "U",            dot: "top",    note: "Sur sélection : Copier", alt: "Monter dans la page = geste trait vers le haut. Depuis une sélection textuelle, exécute à la place la fonction copier" },
  { name: "down_right_angle",      title: "Bas de page",                   sequence: "DDR",                                                    dot: "none", alt: "Aller en bas de page = trait vertical descendant puis trait horizontal (angle droit)" },
  { name: "up_right_angle",        title: "Haut de page",                  sequence: "UUR",                                                    dot: "none", alt: "Aller en haut de page = trait vertical montant puis trait horizontal (angle droit)" },
  { name: "right_left",            title: "Page précédente",               longTitle: "Page précédente répétée",      sequence: "L",            dot: "left", alt: "Aller à la page précédente = trait horizontal vers la gauche, un appui long fait remonter de plusieurs pages" },
  { name: "left_right",            title: "Page suivante",                 longTitle: "Page suivante répétée",        sequence: "R",            dot: "right", alt: "Aller à la page suivante = trait horizontal vers la droite, un appui long fait avancer de plusieurs pages" },
  { name: "right_left_triangle",   title: "Page d'accueil du site",        longTitle: "Page d'accueil du navigateur", sequence: "LURDR",        dot: "bottom-right", alt: "Aller à la page d’accueil du site web = trait horizontal vers la gauche puis diagonale pour faire un retour en forme de triangle, un appui long fait un retour à la page d’accueil du navigateur" },
  { name: "clockwise_circle",      title: "Zoomer",                        longTitle: "Zoom progressif (+10%)",       sequence: "DRDDLLLUURUR", dot: "top-right", alt: "Zoomer = faire un cercle vers le bas et la gauche–sens horaire, un appui long répète le zoom" },
  { name: "anticlockwise_circle",  title: "Dézoomer",                      longTitle: "Dézoom progressif (−10%)",     sequence: "LDLDDRRULUUL", dot: "top-left", alt: "Dézoomer = faire un cercle vers le bas et la droite–sens anti-horaire, un appui long répète le dézoom" },
  { name: "bottom_left_top_right", title: "Agrandir fenêtre",              longTitle: "État fenêtre suivant",         sequence: "UR",           dot: "top-right", inactiveOnMobile: true, alt: "Agrandir la fenêtre = geste diagonal vers le haut-droite, un appui long répète la commande" },
  { name: "top_right_bottom_left", title: "Réduire fenêtre",               longTitle: "État fenêtre précédent",       sequence: "DL",           dot: "bottom-left", inactiveOnMobile: true, alt: "Réduire la fenêtre = geste diagonal vers le bas-gauche, un appui long répète la commande" },
  { name: "right_left_arch",       title: "Onglet précédent",              longTitle: "Onglet précédent répété",      sequence: "DDLLULU",      dot: "bottom-left", alt: "Onglet précédent = geste d’arc de cercle haut-gauche, un appui long répète la commande" },
  { name: "left_right_arch",       title: "Onglet suivant",                longTitle: "Onglet suivant répété",        sequence: "URRDRD",       dot: "bottom-right", alt: "Onglet suivant = geste d’arc de cercle haut-droite, un appui long répète la commande" },
  { name: "top_down_arch",         title: "Nouvel onglet",                 sequence: "DUURRDRD",                                               dot: "bottom-right", note: "Sur lien : ouvre le lien", alt: "Nouvel onglet = geste bas suivi d’un arc de cercle haut-droite, comme un h" },
  { name: "alpha",                 title: "Fermer",                        longTitle: "Fermer répété",                sequence: "DRULDR",       dot: "right", alt: "Fermer = geste alpha, comme un x arrondi sans lever le doigt" },
  { name: "magnifying_glass",      title: "Rechercher sur internet",       longTitle: "Rechercher dans la page",      sequence: "URUURRDLDDL",  dot: "bottom-left", alt: "Rechercher sur internet = geste en forme de loupe, une diagonale haut-droite suivie d’un cercle en sens horaire, si sélection préalable, la recherche se fait sur cette sélection, si appui long en fin de geste la recherche s’effectue intrapage" },
  { name: "left_right_heart",      title: "Ajouter aux favoris",           sequence: "LRULRD",                                                 dot: "right", alt: "Ajouter aux favoris = un trait vers la droite interrompu par un pic, qui revient sur la ligne et reprend vers la droite" },
  { name: "vertical_ribbon",       title: "Enregistrer sous…",             sequence: "DDRURUULL",                                              dot: "none", alt: "Enregistrer sous = un geste en forme d’hameçon qui descend verticalement et en fin de geste forme une boucle droite sur sa hampe" },
  { name: "element_next",          title: "Élément suivant",               longTitle: "Élément suivant répété",       sequence: "RD",           dot: "bottom-right", alt: "Aller à l’élément focusable suivant = trait horizontal puis vers le bas, un appui long répète" },
  { name: "element_prev",          title: "Élément précédent",             longTitle: "Élément précédent répété",     sequence: "LD",           dot: "bottom-left",  alt: "Aller à l’élément focusable précédent = trait horizontal vers la gauche puis vers le bas, un appui long répète" },
  { name: "validate",              title: "Valider",                       sequence: "DRUR",                                                   dot: "none", alt: "Valider l’élément focusé (équivalent Entrée) = geste en forme de V" },
];

const DOT_POS: Record<Exclude<DotPos, "none">, React.CSSProperties> = {
  top:           { top: "4%",  left: "50%",  transform: "translate(-50%, 0)" },
  bottom:        { bottom: "4%", left: "50%", transform: "translate(-50%, 0)" },
  left:          { top: "50%", left: "4%",  transform: "translate(0, -50%)" },
  right:         { top: "50%", right: "4%", transform: "translate(0, -50%)" },
  "top-right":   { top: "6%",  right: "6%" },
  "top-left":    { top: "6%",  left: "6%" },
  "bottom-right":{ bottom: "6%", right: "6%" },
  "bottom-left": { bottom: "6%", left: "6%" },
};

/* Custom SVG illustrations for redrawn gestures.
 * For "home": horizontal left -> diagonal up-right -> diagonal down-right.
 * For "newtab": h-shape (down, up, right-down).
 * The animated variant draws the path on hover.
 */
function HomeIcon({ animated }: { animated: boolean }) {
  // path: start right side, go LEFT, then UP-RIGHT, then DOWN-RIGHT
  const d = "M88 56 L24 56 L60 20 L96 56";
  return (
    <svg viewBox="0 0 112 80" className="h-28 w-28 absolute inset-0 m-auto">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        style={
          animated
            ? {
                strokeDasharray: 1,
                strokeDashoffset: 1,
                animation: "ogc-draw 2s ease-in-out infinite",
              }
            : undefined
        }
      />
      {/* arrowhead on the down-right end */}
      <path
        d="M96 56 L88 50 M96 56 L90 64"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NewTabIcon({ animated }: { animated: boolean }) {
  // h-shape: vertical down on left, then up to mid, then arc down-right
  const d = "M28 12 L28 68 M28 40 Q56 12 84 40 L84 68";
  return (
    <svg viewBox="0 0 112 80" className="h-28 w-28 absolute inset-0 m-auto">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        style={
          animated
            ? {
                strokeDasharray: 1,
                strokeDashoffset: 1,
                animation: "ogc-draw 2s ease-in-out infinite",
              }
            : undefined
        }
      />
      <path
        d="M84 68 L78 62 M84 68 L78 74"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function mobileGesture(g: Gesture): Gesture {
  if (g.name === "top_bottom") return { ...g, name: "bottom_top", title: "Monter", longTitle: "Monter (répété)", note: "Trait simple : défilement tactile natif · Dans un champ : Coller" };
  if (g.name === "bottom_top") return { ...g, name: "top_bottom", title: "Descendre", longTitle: "Descendre (répété)", note: "Trait simple : défilement tactile natif · Sur sélection : Copier" };
  if (g.name === "down_right_angle") return { ...g, name: "up_right_angle", title: "Haut de page" };
  if (g.name === "up_right_angle") return { ...g, name: "down_right_angle", title: "Bas de page" };
  if (g.name === "clockwise_circle") return { ...g, name: "zoomer_mobile", longTitle: undefined, dot: "none", note: "Geste natif du navigateur" };
  if (g.name === "anticlockwise_circle") return { ...g, name: "dezoomer_mobile", longTitle: undefined, dot: "none", note: "Geste natif du navigateur" };
  return g;
}

function GestureCard({ gesture, isMobile }: { gesture: Gesture; isMobile: boolean }) {
  const g = isMobile ? mobileGesture(gesture) : gesture;
  // `playKey` est incrémenté quand l'utilisateur active la vignette au
  // clavier (Entrée / Espace) — il sert de cache-buster sur l'URL du GIF
  // pour forcer le navigateur à relancer l'animation depuis son premier
  // frame. `kbActive` force l'affichage de la variante animée tant que
  // la vignette est focus (équivalent clavier du :hover).
  const [playKey, setPlayKey] = useState(0);
  const [kbActive, setKbActive] = useState(false);
  const figRef = useRef<HTMLElement>(null);
  // Sur appareil tactile (pas de :hover natif), un tap simple sur la
  // vignette doit déclencher la même animation que le survol desktop.
  // L'état revient au repos après ~4 s (durée d'un cycle d'animation).
  const tapTimer = useRef<number | null>(null);
  const activate = () => {
    setKbActive(true);
    setPlayKey((k) => k + 1);
    if (tapTimer.current) window.clearTimeout(tapTimer.current);
    tapTimer.current = window.setTimeout(() => setKbActive(false), 4200);
  };
  useEffect(() => () => {
    if (tapTimer.current) window.clearTimeout(tapTimer.current);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  };

  const activeCls = kbActive ? "ogc-card-active" : "";
  return (
    <figure
      ref={figRef as React.RefObject<HTMLDivElement>}
      tabIndex={0}
      aria-label={`${g.alt || g.title}${isMobile && g.inactiveOnMobile ? " — inactif sur mobile" : ""}`}
      onKeyDown={handleKeyDown}
      onClick={activate}
      className={`ogc-card group ${activeCls} ${isMobile && g.inactiveOnMobile ? "ogc-card-mobile-inactive" : ""} rounded-xl border border-border bg-card p-4 flex flex-col items-center text-center hover:shadow-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
    >
      <div className="relative h-28 w-28 text-foreground">
        {g.custom === "home" ? (
          <>
            <span className="absolute inset-0 group-hover:opacity-0 group-[.ogc-card-active]:opacity-0 transition-opacity">
              <HomeIcon animated={false} />
            </span>
            <span className="absolute inset-0 opacity-0 group-hover:opacity-100 group-[.ogc-card-active]:opacity-100 transition-opacity">
              <HomeIcon animated />
            </span>
          </>
        ) : g.custom === "newtab" ? (
          <>
            <span className="absolute inset-0 group-hover:opacity-0 group-[.ogc-card-active]:opacity-0 transition-opacity">
              <NewTabIcon animated={false} />
            </span>
            <span className="absolute inset-0 opacity-0 group-hover:opacity-100 group-[.ogc-card-active]:opacity-100 transition-opacity">
              <NewTabIcon animated />
            </span>
          </>
        ) : (
          <>
            <img
              src={`/img/${g.name}.png`}
              alt={g.alt || g.title}
              className="ogc-gesture-img absolute inset-0 h-28 w-28 object-contain group-hover:opacity-0 group-[.ogc-card-active]:opacity-0 transition-opacity"
              loading="lazy"
            />
            <img
              src={`/img/${g.name}.gif${playKey ? `?t=${playKey}` : ""}`}
              alt=""
              aria-hidden
              className="ogc-gesture-img absolute inset-0 h-28 w-28 object-contain opacity-0 group-hover:opacity-100 group-[.ogc-card-active]:opacity-100 transition-opacity"
              loading="lazy"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = `/img/${g.name}.png`; }}
            />
          </>
        )}
        {g.dot !== "none" && (
          <span
            aria-hidden
            className="ogc-dot absolute h-3 w-3 rounded-full bg-primary shadow-md"
            style={DOT_POS[g.dot]}
          />
        )}
      </div>
      <figcaption className="mt-3 min-h-[2.5rem] text-sm font-medium relative w-full">
        <span className="ogc-label-base block">{g.title}</span>
        {g.longTitle && (
          <span className="ogc-label-long block absolute inset-0">
            {g.longTitle}
            <span className="block text-[10px] text-muted-foreground font-normal">(appui long)</span>
          </span>
        )}
      </figcaption>
      {g.note && (
        <p className="mt-1 text-[10px] text-muted-foreground italic">{g.note}</p>
      )}
      {isMobile && g.inactiveOnMobile && (
        <p className="mt-1 text-[10px] font-medium text-muted-foreground">Inactif sur mobile</p>
      )}
      <code className="mt-1 text-[10px] text-muted-foreground">{g.sequence}</code>
    </figure>
  );
}

function Memo() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse) and (max-width: 767px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Mémo des gestes
        </h1>
        <p className="mt-2 text-muted-foreground max-w-2xl">
          {isMobile ? "Touchez une vignette pour voir l’animation." : "Survolez une vignette pour voir l’animation."}
          <br />
          Les gestes avec un point orange ont une seconde fonction activable
          par un appui long en fin de geste.
        </p>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {GESTURES.map((g) => (
          <GestureCard key={g.name} gesture={g} isMobile={isMobile} />
        ))}
      </div>
    </section>
  );
}