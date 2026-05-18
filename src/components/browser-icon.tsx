type Name = "firefox" | "chrome" | "edge" | "opera" | "brave";

const COLORS: Record<Name, { bg: string; fg: string }> = {
  firefox: { bg: "#FF7139", fg: "#fff" },
  chrome: { bg: "#4285F4", fg: "#fff" },
  edge: { bg: "#0078D7", fg: "#fff" },
  opera: { bg: "#FF1B2D", fg: "#fff" },
  brave: { bg: "#FB542B", fg: "#fff" },
};

const LETTER: Record<Name, string> = {
  firefox: "F",
  chrome: "C",
  edge: "E",
  opera: "O",
  brave: "B",
};

export function BrowserIcon({
  name,
  size = 16,
  className = "",
}: {
  name: Name;
  size?: number;
  className?: string;
}) {
  const { bg, fg } = COLORS[name];
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center rounded-full font-bold align-[-3px] ${className}`}
      style={{
        background: bg,
        color: fg,
        width: size,
        height: size,
        fontSize: size * 0.6,
        lineHeight: 1,
        marginRight: 4,
      }}
    >
      {LETTER[name]}
    </span>
  );
}