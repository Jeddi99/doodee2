"use client";

import { m } from "framer-motion";
import { useIsMobile } from "@/lib/use-is-mobile";

export function GlowingOrb({ compact = false }: { compact?: boolean } = {}) {
  const isMobile = useIsMobile();
  if (isMobile) return null;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[480px]">
      <div
        aria-hidden
        className="absolute -inset-16 rounded-full opacity-80"
        style={{
          background:
            "radial-gradient(circle, rgba(255,255,255,0.72) 0%, rgba(122,91,214,0.12) 42%, transparent 72%)",
          filter: "blur(34px)",
        }}
      />

      <div
        aria-hidden
        className="absolute inset-0 rounded-full orb-spin-cw-12 motion-reduce:animate-none"
        style={{
          background:
            "conic-gradient(from 0deg, rgba(122,91,214,0) 0%, rgba(122,91,214,0.42) 18%, rgba(47,111,102,0.36) 38%, rgba(255,255,255,0.9) 50%, rgba(47,111,102,0.36) 62%, rgba(122,91,214,0.42) 82%, rgba(122,91,214,0) 100%)",
          WebkitMask:
            "radial-gradient(circle, transparent 60%, black 60.5%, black 67%, transparent 67.5%)",
          mask: "radial-gradient(circle, transparent 60%, black 60.5%, black 67%, transparent 67.5%)",
        }}
      />

      <div
        aria-hidden
        className="absolute inset-[3%] rounded-full orb-spin-ccw-22 motion-reduce:animate-none"
        style={{
          background:
            "conic-gradient(from 180deg, transparent 0%, rgba(36,31,26,0.16) 30%, transparent 60%)",
          WebkitMask:
            "radial-gradient(circle, transparent 56%, black 56.5%, black 60%, transparent 60.5%)",
          mask: "radial-gradient(circle, transparent 56%, black 56.5%, black 60%, transparent 60.5%)",
        }}
      />

      <div
        aria-hidden
        className="absolute inset-[12%] rounded-full border border-[#241f1a]/10 bg-white/70 backdrop-blur-md"
        style={{
          background:
            "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.98) 0%, rgba(248,245,238,0.92) 62%, rgba(232,225,214,0.92) 100%)",
          boxShadow:
            "inset 0 0 60px rgba(122,91,214,0.08), inset 0 0 120px rgba(47,111,102,0.06)",
        }}
      />

      <svg
        aria-hidden
        viewBox="0 0 100 100"
        className="absolute inset-[14%] w-[72%] h-[72%]"
      >
        <defs>
          <linearGradient id="orb-contour" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(168,85,247,0.85)" />
            <stop offset="100%" stopColor="rgba(47,111,102,0.85)" />
          </linearGradient>
          <linearGradient id="orb-beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(6,182,212,0)" />
            <stop offset="45%" stopColor="rgba(47,111,102,0.34)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.95)" />
            <stop offset="55%" stopColor="rgba(122,91,214,0.34)" />
            <stop offset="100%" stopColor="rgba(168,85,247,0)" />
          </linearGradient>
          <radialGradient id="orb-fade" cx="50%" cy="50%" r="50%">
            <stop offset="60%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="orb-circle">
            <rect width="100" height="100" fill="black" />
            <circle cx="50" cy="50" r="42" fill="url(#orb-fade)" />
          </mask>
        </defs>

        {[42, 34, 26, 18, 10].map((r) => (
          <circle
            key={r}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="rgba(36,31,26,0.08)"
            strokeWidth="0.25"
          />
        ))}

        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * Math.PI) / 6;
          const x = 50 + Math.cos(angle) * 42;
          const y = 50 + Math.sin(angle) * 42;
          return (
            <line
              key={i}
              x1="50"
              y1="50"
              x2={x}
              y2={y}
              stroke="rgba(36,31,26,0.06)"
              strokeWidth="0.2"
            />
          );
        })}

        <g mask="url(#orb-circle)">
          <FaceContour />
          <FaceMeshDots />
        </g>

        <rect
          x="0"
          y="0"
          width="100"
          height="4"
          fill="url(#orb-beam)"
          mask="url(#orb-circle)"
          className="orb-scan-beam motion-reduce:animate-none"
        />

        {Array.from({ length: 60 }).map((_, i) => {
          const a = (i * 6 * Math.PI) / 180;
          const inner = i % 5 === 0 ? 44.5 : 45.5;
          const x1 = 50 + Math.cos(a) * inner;
          const y1 = 50 + Math.sin(a) * inner;
          const x2 = 50 + Math.cos(a) * 47;
          const y2 = 50 + Math.sin(a) * 47;
          return (
            <line
              key={`tick-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={i % 5 === 0 ? "rgba(36,31,26,0.22)" : "rgba(36,31,26,0.08)"}
              strokeWidth="0.25"
            />
          );
        })}
      </svg>

      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2f6f66] orb-center-pulse motion-reduce:animate-none"
      />

      <div
        aria-hidden
        className="absolute inset-0 rounded-full border border-dashed border-[#241f1a]/10 orb-spin-ccw-80 motion-reduce:animate-none"
      />

      {!compact && (
        <>
          <OrbitLabel angle={-45} label="FWHR" value="1.86" />
          <OrbitLabel angle={45} label="CANTHAL" value="8.4°" delay={0.4} />
          <OrbitLabel angle={155} label="GONIAL" value="124°" delay={0.8} />
          <OrbitLabel angle={225} label="PHI" value="1.61" delay={1.2} />
        </>
      )}
    </div>
  );
}

function OrbitLabel({
  angle,
  label,
  value,
  delay = 0,
}: {
  angle: number;
  label: string;
  value: string;
  delay?: number;
}) {
  const rad = (angle * Math.PI) / 180;
  const tx = Math.cos(rad) * 58;
  const ty = Math.sin(rad) * 58;
  return (
    <div
      className="absolute left-1/2 top-1/2 hidden md:block"
      style={{ transform: `translate(${tx}%, ${ty}%) translate(-50%, -50%)` }}
    >
      <m.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.8 + delay, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="rounded-lg border border-[#241f1a]/10 bg-white/60 px-2.5 py-1.5 shadow-[0_14px_30px_-24px_rgba(36,31,26,0.28)] backdrop-blur-md">
          <p className="text-[9px] uppercase leading-none tracking-[0.18em] text-[#8a7e74]">
            {label}
          </p>
          <p className="mt-0.5 text-[11px] font-medium leading-tight tabular-nums text-[#241f1a]">
            {value}
          </p>
        </div>
      </m.div>
    </div>
  );
}

function FaceContour() {
  return (
    <g
      fill="none"
      stroke="url(#orb-contour)"
      strokeWidth="0.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.85"
    >
      <path d="M 30 40 Q 30 64, 50 78 Q 70 64, 70 40 Q 70 22, 50 22 Q 30 22, 30 40 Z" />
      <path d="M 38 36 Q 44 33, 50 33 Q 56 33, 62 36" />
      <ellipse cx="42" cy="42" rx="3.5" ry="2" />
      <ellipse cx="58" cy="42" rx="3.5" ry="2" />
      <path d="M 50 44 L 50 56 L 47 58 L 50 60 L 53 58 L 50 56" />
      <path d="M 44 66 Q 50 64, 56 66 Q 50 70, 44 66" />
      <path d="M 36 50 Q 30 60, 42 72" />
      <path d="M 64 50 Q 70 60, 58 72" />
    </g>
  );
}

const FACE_DOTS: Array<[number, number]> = [
  [38, 36],
  [44, 33],
  [50, 32],
  [56, 33],
  [62, 36],
  [40, 42],
  [44, 41],
  [48, 42],
  [52, 42],
  [56, 41],
  [60, 42],
  [50, 48],
  [50, 54],
  [47, 58],
  [50, 60],
  [53, 58],
  [44, 66],
  [48, 65],
  [50, 66],
  [52, 65],
  [56, 66],
  [50, 68],
  [36, 56],
  [38, 64],
  [42, 72],
  [50, 76],
  [58, 72],
  [62, 64],
  [64, 56],
];

function FaceMeshDots() {
  return (
    <g>
      {FACE_DOTS.map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r="0.55"
          fill="rgba(36,31,26,0.58)"
        >
          <animate
            attributeName="opacity"
            values="0.25;1;0.25"
            dur="3s"
            repeatCount="indefinite"
            begin={`${i * 0.045}s`}
          />
        </circle>
      ))}
    </g>
  );
}
