import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Orange Gesture Control — naviguez d'un geste" },
      {
        name: "description",
        content:
          "Extension Firefox MV3 de commande gestuelle. Reconnaissance native compilée en WebAssembly, fallback JS, vocabulaire de 21 gestes.",
      },
    ],
  }),
});

const FEATURES = [
  {
    title: "Moteur natif WebAssembly",
    body: "Le tokeniseur 8 directions historique, porté du C++ et compilé via Emscripten, est chargé dans le service worker.",
  },
  {
    title: "Fallback JavaScript",
    body: "Si le module WASM ne se charge pas, un reconnaisseur JS identique prend le relais sans perte de fonctionnalité.",
  },
  {
    title: "Manifest V3",
    body: "Compatible Firefox 115+. Storage WebExtension, content scripts isolés, plus de XPCOM ni d'overlay XUL.",
  },
  {
    title: "21 gestes prêts à l'emploi",
    body: "Onglets, historique, favoris, zoom, navigation… Le mémo détaillé est disponible dans le menu.",
  },
];

function Index() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10 opacity-20"
          style={{ background: "var(--gradient-primary)" }}
          aria-hidden
        />
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <p className="inline-block rounded-full bg-accent text-accent-foreground text-xs px-3 py-1 mb-4">
                Extension Firefox · v2.0.0 · MV3
              </p>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">
                Pilotez votre navigateur{" "}
                <span className="text-primary">d'un simple geste</span>.
              </h1>
              <p className="mt-5 text-lg text-muted-foreground max-w-prose">
                Orange Gesture Control est l'extension de navigation gestuelle
                née chez Orange Labs, modernisée pour la dernière version de
                Firefox. Maintenez le clic droit, dessinez le geste, relâchez —
                l'action se déclenche.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="/ogc.xpi"
                  download
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-md text-primary-foreground font-medium shadow-lg transition hover:opacity-90"
                  style={{
                    background: "var(--gradient-primary)",
                    boxShadow: "var(--shadow-elegant)",
                  }}
                >
                  Télécharger ogc.xpi
                </a>
                <Link
                  to="/memo"
                  className="inline-flex items-center px-5 py-3 rounded-md border border-border bg-card hover:bg-accent transition"
                >
                  Voir les 21 gestes
                </Link>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Installation&nbsp;: <code>about:debugging</code> →{" "}
                <em>Charger un module complémentaire temporaire</em>.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="aspect-square w-full rounded-xl flex items-center justify-center bg-secondary">
                <img
                  src="/img/right_left.gif"
                  alt="Démonstration d'un geste de souris"
                  className="max-h-72"
                />
              </div>
              <p className="mt-3 text-center text-sm text-muted-foreground">
                Geste droite→gauche : onglet précédent
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight mb-8">
          Ce qui change avec la version modernisée
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-border bg-card p-5 hover:shadow-md transition"
            >
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
