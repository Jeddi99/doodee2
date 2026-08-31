"use client";

export function TryOnHudFrame({
  children,
  compact = false,
  subduedGuide = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
  subduedGuide?: boolean;
}) {
  const guideOpacity = subduedGuide ? "opacity-25" : "opacity-45";
  const heightClass = compact
    ? "min-h-[290px] sm:min-h-[420px]"
    : "min-h-[340px] sm:min-h-[500px]";

  return (
    // Phase 192t — lowered the mobile min-height (430px -> 340px) so the
    // stage frame stops reserving dead vertical space on short phones,
    // which previously cancelled out the 48dvh canvas cap and pushed the
    // control panel below the fold under the bottom nav. sm+ keeps the
    // larger 500px stage where there's room.
    <div className={`relative w-full min-w-0 overflow-hidden rounded-3xl border border-white/60 bg-white/45 shadow-[0_24px_80px_rgba(36,31,26,0.10)] backdrop-blur-md ${heightClass}`}>
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.45] [background-image:radial-gradient(circle,rgba(36,31,26,0.10)_1px,transparent_1px)] [background-size:24px_24px]"
      />
      <HudCorner position="top-left" />
      <HudCorner position="top-right" />
      <HudCorner position="bottom-left" />
      <HudCorner position="bottom-right" />
      <Rings />

      <div
        className={`pointer-events-none absolute inset-x-[10%] top-1/2 h-[44%] -translate-y-1/2 rounded-full border border-white/45 bg-gradient-to-r from-white/35 via-white/15 to-white/30 transition-opacity ${guideOpacity}`}
        aria-hidden
      />

      {/* Phase 192t — inner wrapper min-h kept in sync with the outer
          frame (340px mobile / 500px sm+) for the viewport-fit fix. */}
      <div className={`relative z-20 flex min-w-0 items-center justify-center p-4 sm:p-8 ${heightClass}`}>
        {children}
      </div>
    </div>
  );
}

function Rings() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 520 520"
      className="absolute left-1/2 top-1/2 h-[92%] w-[92%] -translate-x-1/2 -translate-y-1/2"
    >
      <circle
        cx="260"
        cy="260"
        r="218"
        fill="none"
        stroke="rgba(6,126,150,0.18)"
        strokeWidth="1"
        strokeDasharray="3 9"
      />
      <circle
        cx="260"
        cy="260"
        r="176"
        fill="none"
        stroke="rgba(36,31,26,0.12)"
        strokeWidth="1.4"
      />
      <circle
        cx="260"
        cy="260"
        r="128"
        fill="none"
        stroke="rgba(94,69,184,0.14)"
        strokeWidth="1"
      />
    </svg>
  );
}

function HudCorner({
  position,
}: {
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}) {
  const positionClass = {
    "top-left": "left-5 top-5",
    "top-right": "right-5 top-5 rotate-90",
    "bottom-left": "bottom-5 left-5 -rotate-90",
    "bottom-right": "bottom-5 right-5 rotate-180",
  }[position];

  return (
    <svg
      aria-hidden
      viewBox="0 0 34 34"
      className={`absolute z-10 h-10 w-10 text-[#067e96]/45 ${positionClass}`}
    >
      <path
        d="M2 32V2H32"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}
