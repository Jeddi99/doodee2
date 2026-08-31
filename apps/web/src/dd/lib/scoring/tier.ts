import type { Gender } from "@/types";

export type Tier =
  | "gigachad"
  | "chad"
  | "chadlite"
  | "goddess"
  | "stacy"
  | "stacylite"
  | "htn"
  | "mtn"
  | "ltn";

export function tierFor(score: number, gender: Gender): Tier {
  // Use the same 1-decimal rounding the UI displays so a score that
  // renders as "9.0" lands in the gigachad/goddess tier instead of the
  // chad/stacy tier (display said "9.0 · Chad", which contradicted
  // itself for raw 8.95-8.99). NaN/Infinity → ltn floor.
  const rounded = Number.isFinite(score)
    ? Math.round(score * 10) / 10
    : 0;
  if (rounded >= 9) return gender === "male" ? "gigachad" : "goddess";
  if (rounded >= 8) return gender === "male" ? "chad" : "stacy";
  if (rounded >= 7.5) return gender === "male" ? "chadlite" : "stacylite";
  if (rounded >= 6) return "htn";
  if (rounded >= 4.5) return "mtn";
  return "ltn";
}
