import { Link, Outlet, useRouterState } from "@tanstack/react-router";

import { DownloadButton } from "@/components/download-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Accueil" },
  { to: "/memo", label: "Mémo des gestes" },
  { to: "/help", label: "Aide" },
  { to: "/tutorials", label: "Installation" },
] as const;

export function SiteLayout() {
  const isMobile = useIsMobile();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/";
  const logoAlt = isHome
    ? "Page d'accueil d'Orange Gesture Control"
    : "Retour à la page d'accueil d'Orange Gesture Control";

  const NavLinks = () => (
    <>
      {NAV.map((n) => (
        <Link
          key={n.to}
          to={n.to}
          activeOptions={{ exact: true }}
          className="ogc-nav-link px-3 py-1.5 rounded-md transition-colors hover:bg-accent hover:text-accent-foreground w-full md:w-auto text-left md:text-center"
        >
          {n.label}
        </Link>
      ))}
    </>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 group shrink-0">
            <img
              src="/img/logo.png"
              alt={logoAlt}
              className="h-9 w-9 object-contain"
            />
            <span className="font-semibold tracking-tight text-lg hidden sm:inline">
              Orange Gesture<span className="text-primary"> Control</span>
            </span>
          </Link>

          {isMobile ? (
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Menu principal">
                    <Menu className="h-6 w-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="bg-card w-[250px] sm:w-[300px]">
                  <SheetHeader>
                    <SheetTitle className="text-left text-lg font-bold">Menu</SheetTitle>
                  </SheetHeader>
                  <nav className="flex flex-col gap-4 mt-8">
                    <NavLinks />
                    <div className="mt-4 pt-4 border-t border-border">
                      <DownloadButton variant="default" className="w-full" />
                    </div>
                  </nav>
                </SheetContent>
              </Sheet>
            </div>
          ) : (
            <nav className="flex flex-wrap items-center gap-1 text-sm">
              <NavLinks />
              <DownloadButton variant="nav" />
              <ThemeToggle />
            </nav>
          )}
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