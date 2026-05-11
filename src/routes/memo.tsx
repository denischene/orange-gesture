import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/memo")({
  component: Memo,
  head: () => ({
    meta: [
      { title: "Mémo des gestes — Orange Gesture Control" },
      {
        name: "description",
        content:
          "Vocabulaire complet des 21 gestes reconnus par Orange Gesture Control, avec icônes et fonction associée.",
      },
    ],
  }),
});

// Extracted from the original ogc_memo.html.
const GESTURES: { name: string; title: string }[] = [
  { name: "bottom_top", title: "Page d'accueil utilisateur" },
  { name: "right_left", title: "Haut" },
  { name: "left_right", title: "Rechercher" },
  { name: "alpha", title: "Changer présentation" },
  { name: "magnifying_glass", title: "Gauche" },
  { name: "interogation", title: "Fermer" },
  { name: "right_left_triangle", title: "Annuler" },
  { name: "closed_reversed_arch", title: "Aide" },
  { name: "right_left_arch", title: "Nouvel onglet" },
  { name: "left_right_arch", title: "Enregistrer" },
  { name: "top_down_arch", title: "Onglet suivant" },
  { name: "vertical_ribbon", title: "Page d'accueil site web" },
  { name: "left_right_heart", title: "Onglet précédent" },
  { name: "top_down_heart", title: "Maximiser fenêtre" },
  { name: "anticlockwise_circle", title: "Aller à mes favoris" },
  { name: "clockwise_circle", title: "Minimiser fenêtre" },
  { name: "top_right_bottom_left", title: "Ajouter à mes favoris" },
  { name: "bottom_left_top_right", title: "Zoomer" },
  { name: "left_right_bottom", title: "Aller en haut de page" },
  { name: "left_right_top", title: "Dézoomer" },
  { name: "right_left_sym_triangle", title: "Aller en bas de page" },
];

function GestureCard({ name, title }: { name: string; title: string }) {
  // Hover toggles png ↔ animated gif (replaces the legacy ChangeImage script).
  return (
    <figure className="group rounded-xl border border-border bg-card p-4 flex flex-col items-center text-center hover:shadow-md transition">
      <div className="relative h-24 w-24">
        <img
          src={`/img/${name}.png`}
          alt={title}
          className="absolute inset-0 h-24 w-24 object-contain group-hover:opacity-0 transition-opacity"
          loading="lazy"
        />
        <img
          src={`/img/${name}.gif`}
          alt=""
          aria-hidden
          className="absolute inset-0 h-24 w-24 object-contain opacity-0 group-hover:opacity-100 transition-opacity"
          loading="lazy"
        />
      </div>
      <figcaption className="mt-3 text-sm font-medium">{title}</figcaption>
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
          Survolez une vignette pour voir l'animation du tracé. Chaque geste est
          reconnu en 8 directions (U, D, L, R et diagonales) puis tokenisé par
          le moteur natif WebAssembly du service worker.
        </p>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {GESTURES.map((g) => (
          <GestureCard key={g.name} {...g} />
        ))}
      </div>
    </section>
  );
}
