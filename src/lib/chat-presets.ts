export const CHAT_BACKGROUNDS = [
  { id: "aurora", name: "Aurora", className: "bg-preset-aurora" },
  { id: "sunset", name: "Sunset", className: "bg-preset-sunset" },
  { id: "ocean", name: "Ocean", className: "bg-preset-ocean" },
  { id: "forest", name: "Forest", className: "bg-preset-forest" },
  { id: "midnight", name: "Midnight", className: "bg-preset-midnight" },
  { id: "peach", name: "Peach", className: "bg-preset-peach" },
  { id: "mint", name: "Mint", className: "bg-preset-mint" },
  { id: "cocoa", name: "Cocoa", className: "bg-preset-cocoa" },
] as const;

export type PresetId = (typeof CHAT_BACKGROUNDS)[number]["id"];

export const BUBBLE_COLORS = ["blue", "purple", "black", "white"] as const;
export type BubbleColor = (typeof BUBBLE_COLORS)[number];

export function bubbleClasses(color: BubbleColor): string {
  switch (color) {
    case "blue":
      return "bg-[var(--bubble-blue)] text-[var(--bubble-blue-foreground)]";
    case "purple":
      return "bg-[var(--bubble-purple)] text-[var(--bubble-purple-foreground)]";
    case "black":
      return "bg-[var(--bubble-black)] text-[var(--bubble-black-foreground)]";
    case "white":
      return "bg-[var(--bubble-white)] text-[var(--bubble-white-foreground)] border border-white/20";
  }
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const chars = parts.slice(0, 2).map((p) => p[0] ?? "");
  return chars.join("").toUpperCase() || "?";
}

export function colorFromString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `oklch(0.55 0.15 ${hue})`;
}
