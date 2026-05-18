import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("ogc-theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("ogc-theme", next);
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        theme === "dark" ? "Activer le thème clair" : "Activer le thème sombre"
      }
      aria-pressed={theme === "dark"}
      title={
        theme === "dark" ? "Activer le thème clair" : "Activer le thème sombre"
      }
      className="ogc-theme-toggle inline-flex items-center justify-center h-9 w-9 rounded-md border border-border bg-card hover:bg-accent transition-colors"
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}