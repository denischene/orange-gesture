import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { DownloadButton } from "@/components/download-button";

const NAV = [
  { to: "/", label: "Accueil" },
  { to: "/memo", label: "Mémo des gestes" },
  { to: "/help", label: "Aide" },
  { to: "/tutorials", label: "Installation" },
] as const;

export function SiteLayout() {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 group">
            <img
              src="/img/logo.png"
              alt="Orange Gesture Control"
              className="h-9 w-9 object-contain"
            />
            <span className="font-semibold tracking-tight text-lg">
              Orange Gesture<span className="text-primary"> Control</span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {NAV.map((n) => {
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  activeOptions={{ exact: true }}
                  className="ogc-nav-link px-3 py-1.5 rounded-md transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {n.label}
                </Link>
              );
            })}
            <DownloadButton variant="nav" />
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border bg-card/60">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground flex flex-wrap justify-between gap-2">
          <span>© Orange Gesture Control — site rénové à partir du projet historique d'Orange Labs.</span>
        </div>
      </footer>
    </div>
  );
}