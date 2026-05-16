import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/help")({
  component: Help,
  head: () => ({
    meta: [
      { title: "Aide — Orange Gesture Control" },
      {
        name: "description",
        content:
          "Comment utiliser Orange Gesture Control : tracé du geste, mode appui long, configuration, raccourcis disponibles.",
      },
    ],
  }),
});

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold tracking-tight mb-3">{title}</h2>
      <div className="prose prose-sm max-w-none text-foreground">{children}</div>
    </section>
  );
}

function Help() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
        Aide
      </h1>
      <p className="text-muted-foreground mb-10">
        Bienvenue dans l'aide d'Orange Gesture Control.
      </p>

      <Section title="Tracé du geste">
        <p className="text-muted-foreground">
          Par défaut, le geste se trace avec le <strong>bouton droit</strong> de
          la souris, n'importe où sur la page web. Le bouton doit rester appuyé
          pendant toute la durée du geste et être relâché à la fin du tracé.
        </p>
      </Section>

      <Section title="Mode appui long">
        <p className="text-muted-foreground">
          Certaines commandes possèdent une fonction supplémentaire si l'on
          maintient le bouton appuyé en fin de geste (répétition automatique,
          défilement dans une liste…). Elles sont indiquées par{" "}
          <em>(AL)</em> dans le mémo.
        </p>
      </Section>

      <Section title="Limites">
        <p className="text-muted-foreground">
          L'extension Orange Gesture Control ne fonctionne pas sur les pages
          natives du navigateur comme les Paramètres, l'Historique, la Page
          d'accueil du navigateur.
        </p>
      </Section>

      <Section title="Configuration">
        <p className="text-muted-foreground">
          Les préférences (bouton de tracé, sensibilité, affichage des
          tracés et des info-bulles) sont accessibles depuis la page d'options
          de l'extension :{" "}
          <code>about:addons → Orange Gesture Control → Préférences</code>.
        </p>
      </Section>

      <Section title="Reconnaissance native + fallback">
        <p className="text-muted-foreground">
          Le service worker charge un module WebAssembly compilé à partir du
          code C++ historique. Si le chargement échoue (mémoire faible,
          fingerprinting bloqué, MIME type invalide), un reconnaisseur
          JavaScript équivalent prend le relais sans interruption de service.
        </p>
      </Section>

      <Section title="Aller plus loin">
        <p className="text-muted-foreground">
          Le{" "}
          <Link to="/memo" className="text-primary underline">
            mémo des gestes
          </Link>{" "}
          répertorie toutes les commandes.{" "}
          <Link to="/tutorials" className="text-primary underline">
            Suivez le processus d'installation.
          </Link>
        </p>
      </Section>
    </div>
  );
}
