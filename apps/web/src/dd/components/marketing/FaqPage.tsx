"use client";

import Link from "next/link";
import {
  ChevronDown,
  CreditCard,
  HelpCircle,
  ScanFace,
  ShieldCheck,
} from "lucide-react";
import { LandingNav } from "@/components/marketing/LandingNav";
import { PublicPageBackdrop } from "@/components/marketing/PublicPageBackdrop";

interface FaqItem {
  q: string;
  a: string;
}

interface FaqGroup {
  key: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: FaqItem[];
}

const GROUPS: FaqGroup[] = [
  {
    key: "general",
    title: "ทั่วไป",
    icon: HelpCircle,
    items: [
      {
        q: "DOODEE คืออะไร?",
        a: "DOODEE คือรายงานวิเคราะห์ใบหน้าสำหรับผู้ใช้ไทยและเอเชีย อ่านจุดอ้างอิงบนใบหน้าและสรุป 60+ เมตริกเป็นคะแนนพร้อมบริบท ใช้เพื่อทำความเข้าใจใบหน้าและเตรียมคุยกับผู้เชี่ยวชาญ ไม่ใช่การวินิจฉัยทางการแพทย์",
      },
      {
        q: "ใช้งานยากไหม? ต้องสมัครก่อนใช้?",
        a: "สมัครด้วย Google หรืออีเมล แล้วอัปโหลดรูปหน้าตรง 1 รูป ระบบจะแสดงคะแนน คำอธิบาย และข้อแนะนำเบื้องต้น มีแผนพื้นฐานให้เริ่มโดยไม่ต้องใส่บัตรเครดิต",
      },
      {
        q: "เปิดบนมือถือได้ไหม?",
        a: "ได้ทั้ง iOS / Android ผ่านเบราว์เซอร์ ใช้กล้องในเบราว์เซอร์หรืออัปโหลดจากคลังรูป แนะนำ Safari 16+ หรือ Chrome 110+",
      },
      {
        q: "ภาษาอะไรบ้าง?",
        a: "ตอนนี้รองรับไทย + อังกฤษ. สลับได้จากปุ่ม TH/EN มุมขวาบน",
      },
    ],
  },
  {
    key: "scan",
    title: "เทคนิคการสแกน",
    icon: ScanFace,
    items: [
      {
        q: "ถ่ายรูปยังไงให้ผลน่าเชื่อถือและเทียบกันได้มากขึ้น?",
        a: "หน้าตรง ตามองกล้อง, แสงจากด้านหน้าเฉลี่ยทั้งสองข้าง (ไม่ย้อนแสง), ไม่ใส่แว่น/หมวก/แมสก์, หน้าเอ็กซ์เพรชชั่นปกติ (ไม่ยิ้มกว้าง/มุ่ย), ระยะห่างประมาณ 40-60 ซม. ระบบจะเตือนถ้าคุณภาพรูปไม่ดี",
      },
      {
        q: "ทำไมต้องเพิ่มภาพด้านข้าง?",
        a: "ภาพด้านหน้าวัดสัดส่วนเชิงระนาบได้ เช่น ความสมมาตรและอัตราส่วนแนวตั้ง ส่วนมุมจมูก-ริมฝีปาก ความนูนของใบหน้า และตำแหน่งริมฝีปากบน Ricketts E line ต้องใช้ภาพด้านข้างเพื่อให้ประเมินได้เหมาะกว่า",
      },
      {
        q: "Multi-photo compare ทำงานยังไง?",
        a: "ในแพ็กเกจ Pro คุณสามารถใช้ 2-5 รูปเพื่อเฉลี่ยตำแหน่งจุดอ้างอิง ลดความผันผวนจากมุมหน้า สีหน้า หรือการถือกล้องไม่นิ่ง",
      },
      {
        q: "ทำไมคะแนนสูงขึ้น/ลงลงเมื่อสแกนซ้ำ?",
        a: "เพราะแสง มุมหน้า สีหน้า และคุณภาพรูปมีผลต่อการอ่านจุดอ้างอิง ควรถ่ายในเงื่อนไขใกล้เคียงกันเมื่อต้องการเทียบผล",
      },
    ],
  },
  {
    key: "pricing",
    title: "การชำระเงิน",
    icon: CreditCard,
    items: [
      {
        q: "เริ่มใช้งานโดยไม่ใส่บัตรได้ไหม?",
        a: "ได้ — แผนพื้นฐานให้ 1 การประเมินหลังสมัคร เพื่อดูรูปแบบรายงานโดยไม่ต้องใส่บัตรเครดิต",
      },
      {
        q: "ราคาแพ็กเกจ Plus / Pro?",
        a: "Plus 149 บาท/เดือน (10 การประเมิน + 5 ภาพอ้างอิง + try-on + PDF). Pro 299 บาท/เดือน (30 การประเมิน + 20 ภาพอ้างอิง + เปรียบเทียบหลายรูป + PDF). PromptPay เป็นสิทธิ์ 30 วันแบบจ่ายครั้งเดียว ส่วนบัตรเป็นสมาชิกรายเดือน",
      },
      {
        q: "Combo คิดเป็นกี่ครั้ง?",
        a: "Combo 1 รูป (รวม 2-3 หัตถการในภาพเดียว) = 1 ภาพอ้างอิง ไม่ว่าจะเลือก 2 หรือ 3 รายการก็คิดเท่ากัน",
      },
      {
        q: "ยกเลิกได้เมื่อไหร่?",
        a: "PromptPay เป็นสิทธิ์ 30 วันแบบจ่ายครั้งเดียว จึงไม่มีการตัดรอบถัดไป. สมาชิกบัตรยกเลิกได้ทุกเมื่อจากหน้า Account และใช้ต่อได้จนหมดรอบที่จ่ายไว้ ไม่มีค่าธรรมเนียมยกเลิก",
      },
      {
        q: "คืนเงินได้ไหม?",
        a: "ขอคืนเงินได้ภายใน 7 วัน หากยังไม่ใช้โควต้าหลังชำระเงิน ทีมจะตรวจสอบตามเงื่อนไข ติดต่อ hello@doodee.app หรือ Line @doodee",
      },
      {
        q: "รับ PromptPay ไหม?",
        a: "PromptPay เมื่อเปิดให้ใช้จะเป็นการจ่ายครั้งเดียวเพื่อรับสิทธิ์ 30 วัน ไม่ผูกบัตรและไม่ต่ออายุอัตโนมัติ. ถ้า PromptPay ยังไม่พร้อมในหน้าชำระเงิน ให้ใช้บัตรเครดิต/เดบิตแทน",
      },
    ],
  },
  {
    key: "privacy",
    title: "ความปลอดภัย",
    icon: ShieldCheck,
    items: [
      {
        q: "ภาพของฉันถูกอัปโหลดไหม?",
        a: "การประเมินหลักทำในเบราว์เซอร์ ฟีเจอร์ที่ต้องใช้การประมวลผลฝั่งเซิร์ฟเวอร์จะส่งเฉพาะข้อมูลที่จำเป็นตามนโยบายความเป็นส่วนตัว และลิงก์แชร์ไม่ใส่รูปต้นฉบับ",
      },
      {
        q: "เก็บประวัติสแกนที่ไหน?",
        a: "ข้อมูลบัญชีและประวัติที่ซิงก์ไว้ถูกเก็บในระบบฐานข้อมูลที่จำกัดสิทธิ์การเข้าถึง ข้อมูลที่บันทึกเฉพาะเครื่องจะอยู่ในเบราว์เซอร์ของอุปกรณ์นั้น",
      },
      {
        q: "ลบบัญชีและข้อมูลได้ไหม?",
        a: "ได้ — ไปที่ Settings → 'ลบบัญชี'. เราจะลบหรือทำให้ข้อมูลบัญชีไม่ระบุตัวตนเท่าที่กฎหมายอนุญาต และเก็บข้อมูลชำระเงิน/ภาษีเท่าที่จำเป็นตามข้อกำหนด",
      },
      {
        q: "ใช้ข้อมูลของฉันเทรน AI ไหม?",
        a: "เราไม่ใช้รูปหรือรายงานของคุณเพื่อเทรนโมเดลโดยไม่ได้รับความยินยอม ฟีเจอร์ที่ต้องประมวลผลออนไลน์ใช้ข้อมูลตามขอบเขตที่ระบุในนโยบายความเป็นส่วนตัว",
      },
      {
        q: "Doodee เป็นการวินิจฉัยทางการแพทย์ไหม?",
        a: "ไม่ใช่ DOODEE เป็นรายงานวิเคราะห์ใบหน้าเพื่อการศึกษาและประกอบการตัดสินใจ คำแนะนำเรื่องหัตถการเป็นแนวทางทั่วไป และต้องปรึกษาแพทย์ผิวหนังหรือศัลยแพทย์ตกแต่งที่มีใบอนุญาตก่อนทำจริง",
      },
    ],
  },
];

export function FaqPage() {
  return (
    <main className="app-glass-page relative min-h-[100dvh] overflow-x-hidden bg-transparent text-[#241f1a]">
      <PublicPageBackdrop />
      <LandingNav />

      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-32 pt-12 sm:px-8 sm:pt-20">
        <header className="space-y-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#056f82]">
            คำถามสำคัญ
          </p>
          <h1 className="font-serif text-5xl font-light italic leading-tight text-[#241f1a] sm:text-6xl">
            คำถามที่พบบ่อย
          </h1>
          <p className="mx-auto max-w-xl text-sm leading-relaxed text-[#625a52] sm:text-base">
            คำตอบสั้น ชัดเจน เรื่องการสแกน ความแม่นยำ ความเป็นส่วนตัว และแพ็กเกจ ถ้าไม่เจอคำตอบที่นี่ ทักไลน์{" "}
            <span className="text-[#056f82]">@doodee</span> ได้เลย
          </p>
          <div className="flex flex-col items-center justify-center gap-3 pt-3 sm:flex-row">
            <Link
              href={"/scan" as never}
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-[#241f1a] px-6 text-sm font-semibold text-white shadow-[0_18px_44px_-32px_rgba(36,31,26,0.55)] transition hover:bg-[#342d27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35 sm:w-auto"
            >
              เริ่มประเมินใบหน้า
            </Link>
            <Link
              href={"/blog" as never}
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full border border-white/60 bg-white/50 px-6 text-sm font-semibold text-[#4d453e] shadow-[0_14px_34px_-30px_rgba(36,31,26,0.38)] backdrop-blur transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35 sm:w-auto"
            >
              อ่านคู่มือก่อนสแกน
            </Link>
          </div>
        </header>

        <div className="mt-12 space-y-10">
          {GROUPS.map((g) => {
            const Icon = g.icon;
            return (
              <section key={g.key} id={g.key} className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/60 bg-white/50 text-[#056f82] shadow-[0_10px_24px_-22px_rgba(6,126,150,0.28)] backdrop-blur">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h2 className="font-serif text-2xl font-light italic">
                    {g.title}
                  </h2>
                </div>
                <ul className="space-y-2">
                  {g.items.map((it) => (
                    <li key={it.q}>
                      <details className="group rounded-2xl border border-white/60 bg-white/50 shadow-[0_14px_42px_-36px_rgba(36,31,26,0.36)] backdrop-blur-md transition open:border-[#067e96]/25 open:bg-white/65">
                        <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-base font-semibold leading-snug text-[#241f1a] hover:bg-white/30 hover:text-[#3a332d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35">
                          <span>{it.q}</span>
                          <ChevronDown className="h-4 w-4 flex-none text-[#8a7e74] transition-transform group-open:rotate-180" />
                        </summary>
                        <p className="border-t border-white/55 px-5 py-4 text-[15px] leading-relaxed text-[#514942] sm:text-base">
                          {it.a}
                        </p>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <section className="mt-16 rounded-3xl border border-white/60 bg-white/50 p-8 text-center shadow-[0_20px_60px_-46px_rgba(36,31,26,0.42)] backdrop-blur-md">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#056f82]">
            ยังมีคำถามอยู่?
          </p>
          <h3 className="mt-2 font-serif text-2xl font-light italic">
            คุยกับทีม DOODEE
          </h3>
          <p className="mt-2 text-sm text-[#625a52]">
            อีเมล:{" "}
            <a
              href="mailto:hello@doodee.app"
              className="inline-flex min-h-[44px] items-center rounded-md px-2 py-2 text-[#056f82] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35"
            >
              hello@doodee.app
            </a>
            {" · "}Line: <span className="text-[#056f82]">@doodee</span>
          </p>
          <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={"/scan" as never}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#241f1a] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#342d27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35 sm:w-auto"
            >
              เริ่มประเมินใบหน้า
            </Link>
            <Link
              href={"/upgrade" as never}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-white/60 bg-white/45 px-5 py-2.5 text-sm text-[#4d453e] shadow-[0_12px_30px_-26px_rgba(36,31,26,0.34)] backdrop-blur transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35 sm:w-auto"
            >
              ดูแพ็กเกจ
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
