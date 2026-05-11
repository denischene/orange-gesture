import { Link, Outlet, useLocation } from "@tanstack/react-router";

const NAV = [
  { to: "/", label: "Accueil" },
  { to: "/memo", label: "Mémo des gestes" },
  { to: "/help", label: "Aide" },
  { to: "/tutorials", label: "Tutoriels" },
] as const;

export function SiteLayout() {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 group">
            <span
              className="inline-block h-7 w-7 rounded-sm"
              style={{ background: "var(--gradient-primary)" }}
              aria-hidden
            />
            <span className="font-semibold tracking-tight text-lg">
              Orange Gesture<span className="text-primary"> Control</span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {NAV.map((n) => {
              const active = pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={
                    "px-3 py-1.5 rounded-md transition-colors " +
                    (active
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent hover:text-accent-foreground")
                  }
                >
                  {n.label}
                </Link>
              );
            })}
            <a
              href="/ogc.xpi"
              download
              className="ml-2 px-3 py-1.5 rounded-md text-primary-foreground font-medium text-sm shadow-sm hover:opacity-90 transition"
              style={{ background: "var(--gradient-primary)" }}
            >
              Télécharger l'extension
            </a>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border bg-card/60">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground flex flex-wrap justify-between gap-2">
          <span>© Orange Gesture Control — site rénové à partir du projet historique d'Orange Labs.</span>
          <span>Extension Firefox MV3 v2.0.0</span>
        </div>
      </footer>
    </div>
  );
}