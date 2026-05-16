import { createFileRoute, Link } from "@tanstack/react-router";
import { DownloadButton } from "@/components/download-button";

export const Route = createFileRoute("/tutorials")({
  component: Tutorials,
  head: () => ({
    meta: [
      { title: "Installation — Orange Gesture Control" },
      {
        name: "description",
        content:
          "Installation et premiers pas avec Orange Gesture Control sur Firefox.",
      },
    ],
  }),
});

const STEPS = [
  {
    n: 1,
    title: "Téléchargez l'extension",
    body: (
      <>
        Téléchargez l'extension pour votre navigateur (Firefox, Chrome, Edge,
        Opera, Brave) :
        <span className="mt-2 inline-block">
          <DownloadButton />
        </span>
      </>
    ),
  },
  {
    n: 2,
    title: "Installez en mode développeur",
    body: (
      <>
        Ouvrez <code>about:debugging#/runtime/this-firefox</code>, cliquez sur{" "}
        <em>Charger un module complémentaire temporaire</em>, puis sélectionnez
        le fichier <code>ogc.xpi</code>.
      </>
    ),
  },
  {
    n: 3,
    title: "Tracez votre premier geste",
    body: (
      <>
        Sur n'importe quelle page web, maintenez le clic droit, dessinez par
        exemple un trait <strong>de droite vers la gauche</strong> et relâchez —
        l'onglet revient à la page précédente.
      </>
    ),
  },
  {
    n: 4,
    title: "Découvrez le vocabulaire",
    body: (
      <>
        Consultez le{" "}
        <Link to="/memo" className="text-primary underline">
          mémo des gestes
        </Link>{" "}
        pour découvrir les 19 gestes disponibles et leurs 35 commandes.
      </>
    ),
  },
];

function Tutorials() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
        Installation
      </h1>
      <p className="text-muted-foreground mb-10">
        Quatre étapes pour adopter la navigation gestuelle.
      </p>
      <ol className="space-y-4">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className="rounded-xl border border-border bg-card p-5 flex gap-4"
          >
            <span
              className="shrink-0 h-10 w-10 rounded-full text-primary-foreground font-semibold flex items-center justify-center"
              style={{ background: "var(--gradient-primary)" }}
            >
              {s.n}
            </span>
            <div>
              <h2 className="font-semibold mb-1">{s.title}</h2>
              <p className="text-sm text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
