import { useEffect, useRef, useState } from "react";

type Browser = {
  key: string;
  label: string;
  href: string;
  hint: string;
};

const BROWSERS: Browser[] = [
  { key: "firefox", label: "Firefox", href: "/ogc.xpi", hint: "Fichier .xpi" },
  { key: "chrome", label: "Chrome", href: "/ogc.zip", hint: "Archive .zip (mode développeur)" },
  { key: "edge", label: "Edge", href: "/ogc.zip", hint: "Archive .zip (mode développeur)" },
  { key: "opera", label: "Opera", href: "/ogc.zip", hint: "Archive .zip (mode développeur)" },
  { key: "brave", label: "Brave", href: "/ogc.zip", hint: "Archive .zip (mode développeur)" },
];

export function DownloadButton({
  label = "Télécharger l'extension",
  variant = "primary",
  className = "",
}: {
  label?: string;
  variant?: "primary" | "nav" | "hero";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const base =
    variant === "nav"
      ? "ml-2 px-3 py-1.5 rounded-md font-medium text-sm shadow-sm hover:opacity-90 transition"
      : variant === "hero"
        ? "inline-flex items-center gap-2 px-5 py-3 rounded-md font-medium shadow-lg transition hover:opacity-90"
        : "inline-flex items-center gap-2 px-4 py-2 rounded-md font-medium shadow-sm hover:opacity-90 transition";

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={base}
        style={{
          background: "var(--primary)",
          color: "#000",
          boxShadow: variant === "hero" ? "var(--shadow-elegant)" : undefined,
        }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
        <span aria-hidden style={{ fontSize: "0.7em" }}>▾</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 rounded-md border border-border bg-card shadow-lg z-50 overflow-hidden"
        >
          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
            Choisissez votre navigateur
          </div>
          {BROWSERS.map((b) => (
            <a
              key={b.key}
              href={b.href}
              download
              onClick={() => setOpen(false)}
              className="flex items-start justify-between gap-3 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <span className="font-medium text-foreground">{b.label}</span>
              <span className="text-xs text-muted-foreground">{b.hint}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}