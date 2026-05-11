import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/memo")({
  component: Memo,
  head: () => ({
    meta: [
      { title: "Mémo des gestes — Orange Gesture Control" },
      {
        name: "description",
        content:
          "Vocabulaire des 19 gestes reconnus par Orange Gesture Control, avec illustration animée et fonction d'appui long.",
      },
    ],
  }),
});

type DotPos = "top" | "bottom" | "left" | "right" | "top-right" | "top-left" | "bottom-right" | "bottom-left";

type Gesture = {
  name: string;
  title: string;
  longTitle?: string;
  sequence: string;
  dot: DotPos;
  note?: string;
};

// Reorganised gesture vocabulary — see user spec.
const GESTURES: Gesture[] = [
  { name: "undo",                  title: "Page d'accueil du site",        longTitle: "Page d'accueil du navigateur", sequence: "LURDR",        dot: "right" },
  { name: "bottom_top",            title: "Haut",                          longTitle: "Haut répété",                  sequence: "U",            dot: "top",    note: "Sur sélection : Copier" },
  { name: "top_bottom",            title: "Bas",                           longTitle: "Bas répété",                   sequence: "D",            dot: "bottom", note: "Dans un champ : Coller" },
  { name: "magnifying_glass",      title: "Rechercher sur internet",       longTitle: "Rechercher dans la page",      sequence: "URUURRDLDDL",  dot: "bottom-left" },
  { name: "interogation",          title: "Aide",                          sequence: "UURRDDLDD",                                              dot: "bottom" },
  { name: "left_right_top",        title: "Aller en haut de page",         sequence: "RU",                                                     dot: "top-right" },
  { name: "left_right_bottom",     title: "Aller en bas de page",          sequence: "RD",                                                     dot: "bottom-right" },
  { name: "clockwise_circle",      title: "Zoomer",                        longTitle: "Zoom progressif (+10%)",       sequence: "DRDDLLLUURUR", dot: "right" },
  { name: "anticlockwise_circle",  title: "Dézoomer",                      longTitle: "Dézoom progressif (−10%)",     sequence: "LDLDDRRULUUL", dot: "left" },
  { name: "top_down_heart",        title: "Nouvel onglet",                 sequence: "DUURRDRD",                                               dot: "bottom-right", note: "Sur lien : ouvre le lien" },
  { name: "left_right_arch",       title: "Onglet suivant",                longTitle: "Onglet suivant répété",        sequence: "URRDRD",       dot: "bottom-right" },
  { name: "right_left_arch",       title: "Onglet précédent",              longTitle: "Onglet précédent répété",      sequence: "DDLLULU",      dot: "top-left" },
  { name: "alpha",                 title: "Fermer",                        longTitle: "Fermer répété",                sequence: "α",            dot: "right" },
  { name: "bottom_left_top_right", title: "Agrandir fenêtre",              longTitle: "État fenêtre suivant",         sequence: "UR",           dot: "top-right" },
  { name: "top_right_bottom_left", title: "Réduire fenêtre",               longTitle: "État fenêtre précédent",       sequence: "DL",           dot: "bottom-left" },
  { name: "left_right_heart",      title: "Ajouter aux favoris",           sequence: "—",                                                      dot: "right" },
  { name: "vertical_ribbon",       title: "Enregistrer sous…",             sequence: "DDRURUULL",                                              dot: "left" },
  { name: "right_left",            title: "Page précédente",               longTitle: "Page précédente répétée",      sequence: "L",            dot: "left" },
  { name: "left_right",            title: "Page suivante",                 longTitle: "Page suivante répétée",        sequence: "R",            dot: "right" },
];

const DOT_POS: Record<DotPos, React.CSSProperties> = {
  top:           { top: "4%",  left: "50%",  transform: "translate(-50%, 0)" },
  bottom:        { bottom: "4%", left: "50%", transform: "translate(-50%, 0)" },
  left:          { top: "50%", left: "4%",  transform: "translate(0, -50%)" },
  right:         { top: "50%", right: "4%", transform: "translate(0, -50%)" },
  "top-right":   { top: "6%",  right: "6%" },
  "top-left":    { top: "6%",  left: "6%" },
  "bottom-right":{ bottom: "6%", right: "6%" },
  "bottom-left": { bottom: "6%", left: "6%" },
};

function GestureCard({ g }: { g: Gesture }) {
  return (
    <figure className="ogc-card group rounded-xl border border-border bg-card p-4 flex flex-col items-center text-center hover:shadow-md transition">
      <div className="relative h-28 w-28">
        <img
          src={`/img/${g.name}.png`}
          alt={g.title}
          className="absolute inset-0 h-28 w-28 object-contain group-hover:opacity-0 transition-opacity"
          loading="lazy"
        />
        <img
          src={`/img/${g.name}.gif`}
          alt=""
          aria-hidden
          className="absolute inset-0 h-28 w-28 object-contain opacity-0 group-hover:opacity-100 transition-opacity"
          loading="lazy"
        />
        {/* Orange dot — placed at the arrow extremity, animated on hover */}
        <span
          aria-hidden
          className="ogc-dot absolute h-3 w-3 rounded-full bg-primary shadow-md"
          style={DOT_POS[g.dot]}
        />
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
      <code className="mt-1 text-[10px] text-muted-foreground">{g.sequence}</code>
    </figure>
  );
}

function Memo() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Mémo des gestes
        </h1>
        <p className="mt-2 text-muted-foreground max-w-2xl">
          Survolez une vignette pour voir l'animation. Le point orange marque la
          fin du tracé&nbsp;: lorsqu'il grossit, l'appui long s'active et la
          fonction associée remplace la fonction principale.
        </p>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {GESTURES.map((g) => (
          <GestureCard key={g.name} g={g} />
        ))}
      </div>
    </section>
  );
}
