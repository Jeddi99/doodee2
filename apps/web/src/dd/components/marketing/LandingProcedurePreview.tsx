"use client";

import Image from "next/image";
import { ArrowLeftRight, Check } from "lucide-react";
import { useRef, useState } from "react";

import type { Lang } from "@/lib/i18n";

const copy = {
  label: { th: "ภาพอ้างอิงหัตถการ", en: "Procedure preview" },
  title: {
    th: "เห็นทิศทางก่อน แล้วค่อยตัดสินใจ",
    en: "See the direction before you decide.",
  },
  body: {
    th: "เลื่อนเพื่อเทียบภาพต้นฉบับกับภาพอ้างอิง ขั้นตอนจริงเริ่มจากบริเวณที่ผู้ใช้เลือก แล้วเก็บภาพต้นฉบับไว้เป็นจุดอ้างอิงตลอดการเปรียบเทียบ",
    en: "Drag to compare the original with a directional reference. The live workflow begins with the area you select and keeps the original image visible as the comparison baseline.",
  },
  before: { th: "ภาพต้นฉบับ", en: "Original" },
  after: { th: "ภาพอ้างอิง", en: "Directional reference" },
  drag: { th: "ลากเพื่อเปรียบเทียบ", en: "Drag to compare" },
  sample: { th: "ตัวอย่างภาพอ้างอิง · ไม่ใช่ผลลัพธ์รับประกัน", en: "Sample visual reference · not a predicted result" },
  disclaimer: {
    th: "ภาพนี้ใช้เพื่อสำรวจทิศทางและเตรียมคำถามก่อนปรึกษาแพทย์ ไม่ใช่คำแนะนำทางการแพทย์หรือการรับประกันผลลัพธ์",
    en: "Use this image to explore a direction and prepare consultation questions. It is not medical advice or a guaranteed outcome.",
  },
  points: [
    { th: "เริ่มจากบริเวณที่คุณเลือก", en: "Start from the area you select" },
    { th: "เปรียบเทียบความชัด 4 ระดับ", en: "Compare four ordered strengths" },
    { th: "เก็บภาพต้นฉบับไว้อ้างอิง", en: "Keep the original as the reference" },
  ],
} as const;

const BEFORE_SRC = "/upgrade-assets/doodee-user-male-before.webp";
const AFTER_SRC = "/upgrade-assets/doodee-user-male-after-v3.webp";

export function LandingProcedurePreview({ lang }: { lang: Lang }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [split, setSplit] = useState(50);

  const updateSplit = (clientX: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setSplit(Math.max(0, Math.min(100, next)));
  };

  return (
    <section id="preview" className="landing-clinical-section mx-auto w-full max-w-[88rem] px-5 py-20 sm:px-8 sm:py-28 lg:px-10 lg:py-36">
      <div className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12">
        <div data-reveal className="lg:col-span-4">
          <p className="landing-section-label">{copy.label[lang]}</p>
          <h2 className="mt-5 max-w-[12ch] text-balance font-display text-[2.75rem] font-semibold leading-[0.98] tracking-normal text-[#071225] sm:text-5xl lg:text-[4rem]">
            {copy.title[lang]}
          </h2>
          <p className="mt-6 max-w-[34rem] text-pretty text-base leading-7 text-[#53616d] sm:text-lg sm:leading-8">
            {copy.body[lang]}
          </p>
          <ul className="mt-8 border-y border-[#071225]/10">
            {copy.points.map((point) => (
              <li key={point.en} className="flex min-h-14 items-center gap-3 border-b border-[#071225]/10 text-sm font-medium text-[#243443] last:border-b-0">
                <Check className="h-4 w-4 shrink-0 text-[#087e8b]" aria-hidden />
                {point[lang]}
              </li>
            ))}
          </ul>
        </div>

        <div data-reveal className="lg:col-span-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-[#53616d]">
            <span>{copy.sample[lang]}</span>
            <span className="inline-flex items-center gap-2 text-[#087e8b]">
              <ArrowLeftRight className="h-4 w-4" aria-hidden />
              {copy.drag[lang]}
            </span>
          </div>
          <div
            ref={frameRef}
            role="slider"
            tabIndex={0}
            aria-label={copy.drag[lang]}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(split)}
            aria-valuetext={`${Math.round(split)}% ${copy.after[lang]}`}
            data-testid="landing-procedure-slider"
            className="landing-procedure-slider relative aspect-[4/5] w-full select-none overflow-hidden rounded-2xl bg-[#dce2e5] outline-none focus-visible:ring-2 focus-visible:ring-[#087e8b] focus-visible:ring-offset-4 focus-visible:ring-offset-[#f4f7f7] sm:aspect-[4/3] lg:aspect-[16/11]"
            style={{ touchAction: "pan-y" }}
            onMouseDown={(event) => updateSplit(event.clientX)}
            onMouseMove={(event) => {
              if (event.buttons === 1) updateSplit(event.clientX);
            }}
            onTouchMove={(event) => {
              const touch = event.touches[0];
              if (touch) updateSplit(touch.clientX);
            }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const delta = event.key === "ArrowRight" ? 5 : -5;
              setSplit((current) => Math.max(0, Math.min(100, current + delta)));
            }}
          >
            <Image
              src={BEFORE_SRC}
              alt={copy.before[lang]}
              fill
              priority={false}
              sizes="(min-width: 1024px) 62vw, 100vw"
              className="pointer-events-none object-cover object-[50%_38%]"
              draggable={false}
            />
            <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
              <Image
                src={AFTER_SRC}
                alt={copy.after[lang]}
                fill
                sizes="(min-width: 1024px) 62vw, 100vw"
                className="pointer-events-none object-cover object-[50%_38%]"
                draggable={false}
              />
            </div>
            <span className="absolute left-4 top-4 rounded-full bg-[#071225]/82 px-3 py-1.5 text-xs font-semibold text-white">
              {copy.before[lang]}
            </span>
            <span className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#071225]">
              {copy.after[lang]}
            </span>
            <div className="pointer-events-none absolute inset-y-0" style={{ left: `${split}%` }}>
              <span className="absolute inset-y-0 w-px -translate-x-1/2 bg-white" />
              <span className="absolute top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#071225] shadow-[0_4px_8px_rgba(7,18,37,0.18)]">
                <ArrowLeftRight className="h-5 w-5" aria-hidden />
              </span>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-[#65727d]">{copy.disclaimer[lang]}</p>
        </div>
      </div>
    </section>
  );
}
