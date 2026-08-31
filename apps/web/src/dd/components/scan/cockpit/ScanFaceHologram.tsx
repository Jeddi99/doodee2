"use client";

import Image from "next/image";

export function ScanFaceHologram({
  size = 380,
  idleMode = false,
  staticMode = false,
}: {
  size?: number;
  idleMode?: boolean;
  staticMode?: boolean;
}) {
  const opacityClass = staticMode
    ? "opacity-70"
    : idleMode
      ? "opacity-[0.55]"
      : "opacity-100";

  return (
    <div
      className={`relative mx-auto max-w-full overflow-hidden rounded-[2rem] border border-white/60 bg-white/40 shadow-[0_18px_48px_-40px_rgba(36,31,26,0.34)] backdrop-blur-md transition-opacity ${opacityClass}`}
      style={{ width: `min(${size}px, 100%)`, aspectRatio: "1 / 1" }}
      aria-hidden
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.55),rgba(239,248,248,0.48))]" />
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 z-10 h-full w-full"
      >
        <ellipse
          cx="50"
          cy="51"
          rx="27"
          ry="35"
          fill="none"
          stroke="rgba(36,31,26,0.13)"
          strokeWidth="0.7"
        />
        <path
          d="M29 47H71"
          fill="none"
          stroke="rgba(15,111,127,0.22)"
          strokeWidth="0.7"
          strokeLinecap="round"
        />
        <path
          d="M38 68C44 72 56 72 62 68"
          fill="none"
          stroke="rgba(36,31,26,0.12)"
          strokeWidth="0.7"
          strokeLinecap="round"
        />
      </svg>

      <div className="absolute inset-[6%]">
        <Image
          src="/upgrade-assets/landing-hero-male-face-light.png"
          alt=""
          fill
          sizes={`${size}px`}
          priority
          className="select-none rounded-[1.75rem] object-cover opacity-[0.74]"
        />
      </div>
    </div>
  );
}
