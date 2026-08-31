"use client";

import type { CSSProperties } from "react";

import type { Lang } from "@/lib/i18n";

type Localized = Record<Lang, string>;

const copy = {
  label: { th: "หลักฐานที่ตรวจสอบได้", en: "Verifiable product evidence" },
  title: {
    th: "ความน่าเชื่อถือควรมาจากสิ่งที่ตรวจสอบได้",
    en: "Trust should come from what can be checked",
  },
  body: {
    th: "DOODEE ยังไม่ใช้รีวิวปลอมหรือตัวเลขผู้ใช้ที่ตรวจสอบไม่ได้ เราแสดงขอบเขตของระบบ วิธีวัด และข้อจำกัดอย่างตรงไปตรงมา",
    en: "DooDee does not rely on fabricated testimonials or unverifiable user counts. We show the system scope, measurement method, and limitations directly.",
  },
  note: {
    th: "ภาพและตัวเลขบนหน้านี้เป็นข้อมูลตัวอย่างเพื่ออธิบายผลิตภัณฑ์ ไม่ใช่ผลการรักษา",
    en: "Images and report values on this page are product samples, not treatment outcomes.",
  },
} satisfies Record<string, Localized>;

const items: { value: Localized; label: Localized }[] = [
  {
    value: { th: "60+", en: "60+" },
    label: { th: "ตัวชี้วัดใบหน้า", en: "Facial measurements" },
  },
  {
    value: { th: "478", en: "478" },
    label: { th: "จุดอ้างอิงบนใบหน้า", en: "Facial landmarks" },
  },
  {
    value: { th: "6", en: "6" },
    label: { th: "หมวดการประเมิน", en: "Assessment categories" },
  },
  {
    value: { th: "อิงงานวิจัย", en: "Research-informed" },
    label: { th: "อธิบายที่มาและวิธีวัด", en: "Methods and sources explained" },
  },
  {
    value: { th: "บริบทเอเชีย", en: "Asian context" },
    label: { th: "ออกแบบจากบริบทผู้ใช้จริง", en: "Designed around local users" },
  },
];

export function CredibilityStrip({ lang }: { lang: Lang }) {
  return (
    <section id="proof" className="landing-clinical-section mx-auto w-full max-w-[88rem] px-5 py-20 sm:px-8 sm:py-28 lg:px-10 lg:py-36">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div data-reveal className="lg:col-span-5">
          <p className="landing-section-label">{copy.label[lang]}</p>
          <h2 className="mt-5 max-w-[12ch] text-balance font-display text-[2.75rem] font-semibold leading-[0.98] tracking-normal text-[#071225] sm:text-5xl lg:text-[4rem]">
            {copy.title[lang]}
          </h2>
          <p className="mt-6 max-w-xl text-pretty text-base leading-7 text-[#53616d] sm:text-lg sm:leading-8">
            {copy.body[lang]}
          </p>
        </div>

        <div className="lg:col-span-7">
          <dl className="border-t border-[#071225]/14">
            {items.map((item, index) => (
              <div
                key={item.label.en}
                data-reveal
                style={{ "--reveal-delay": `${index * 55}ms` } as CSSProperties}
                className="grid min-h-20 grid-cols-[minmax(8rem,0.72fr)_1fr] items-center gap-5 border-b border-[#071225]/14 py-4 sm:grid-cols-[minmax(12rem,0.72fr)_1fr]"
              >
                <dt className="font-display text-2xl font-semibold leading-tight tracking-normal text-[#071225] tabular-nums sm:text-3xl">
                  {item.value[lang]}
                </dt>
                <dd className="text-sm font-medium leading-6 text-[#53616d] sm:text-base">
                  {item.label[lang]}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-sm leading-6 text-[#65727d]">{copy.note[lang]}</p>
        </div>
      </div>
    </section>
  );
}
