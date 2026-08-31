"use client";

import { cn } from "@/lib/utils/cn";

/**
 * Phase 192s — shared loading spinner primitive.
 *
 * A gradient conic ring (violet → cyan → fuchsia) masked into a thin
 * arc, spun with Tailwind's `animate-spin`. `animate-spin` is the ONE
 * keyframe globals.css deliberately keeps alive on mobile (every other
 * decorative loop is killed <=768px), so this stays animated on phones
 * where users expect a spinner to actually spin.
 *
 * Cheap by construction: a single `transform: rotate` on the compositor,
 * no `filter`, no `backdrop-filter`, no layout-bound properties. The ring
 * is a conic-gradient background clipped to a ring via a radial mask, so
 * there is no SVG stroke / per-frame repaint cost.
 *
 * Reduced-motion: globals' `prefers-reduced-motion: reduce` block clamps
 * animation-duration to ~0, so the ring renders as a static gradient arc
 * (still reads as "busy" via the role/aria) without spinning.
 */

const SIZE_PX = { sm: 16, md: 24, lg: 40 } as const;
const RING_PX = { sm: 2, md: 3, lg: 4 } as const;

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: keyof typeof SIZE_PX;
  /** Optional caption rendered beside the ring (muted, text-sm). */
  label?: string;
}

export function Spinner({
  size = "md",
  label,
  className,
  ...rest
}: SpinnerProps): React.JSX.Element {
  const px = SIZE_PX[size];
  const ring = RING_PX[size];
  // Radial mask cuts the filled disc down to a `ring`-thick annulus, so the
  // conic gradient reads as a spinning arc rather than a solid pie.
  const mask = `radial-gradient(farthest-side, transparent calc(100% - ${ring}px), #000 calc(100% - ${ring}px))`;
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn("inline-flex items-center gap-2.5 text-muted", className)}
      {...rest}
    >
      <span
        aria-hidden="true"
        className="animate-spin rounded-full"
        style={{
          width: px,
          height: px,
          background:
            "conic-gradient(from 0deg, transparent 0deg, #a855f7 140deg, #06b6d4 250deg, #ec4899 330deg, transparent 360deg)",
          WebkitMask: mask,
          mask,
        }}
      />
      {label ? (
        <span className="text-sm">{label}</span>
      ) : (
        <span className="sr-only">{label ?? "Loading"}</span>
      )}
    </div>
  );
}
