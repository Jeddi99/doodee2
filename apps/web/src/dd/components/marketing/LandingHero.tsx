"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  LockKeyhole,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { LangToggle } from "@/components/LangToggle";
import { DoodeeLogo } from "@/components/DoodeeLogo";
import { BlurText } from "@/components/marketing/BlurText";
import { CredibilityStrip } from "@/components/marketing/CredibilityStrip";
import { LandingProcedurePreview } from "@/components/marketing/LandingProcedurePreview";
import { SampleReportSection } from "@/components/marketing/SampleReportSection";
import { SEO_TOPICS } from "@/components/marketing/seo-topic-data";
import { useT, type Lang } from "@/lib/i18n";
import { promptPayCheckoutEnabled } from "@/lib/billing";
import { getAllPlans } from "@/lib/plans";
import { useScrollReveal } from "@/lib/use-scroll-reveal";

const LOGIN_HREF = "/login" as never;
const NAV_COMPACT_THRESHOLD = 56;
const LANDING_NAV_SECTION_IDS = [
  "report",
  "how-it-works",
  "why-doodee",
  "pricing",
  "faq",
] as const;

type Localized = Record<Lang, string>;

type IconCard = {
  icon: ReactNode;
  title: Localized;
  body: Localized;
};

type FaqItem = {
  q: Localized;
  a: Localized;
};

const copy = {
  navReport: { th: "รายงาน", en: "Report" },
  navHow: { th: "วิธีทำงาน", en: "How it works" },
  navWhy: { th: "ทำไมต้อง DOODEE", en: "Why DooDee" },
  navFaq: { th: "คำถาม", en: "FAQ" },
  navCta: { th: "เริ่มต้น", en: "Get started" },
  navProduct: { th: "ผลิตภัณฑ์", en: "Product" },
  navExamples: { th: "ตัวอย่างรายงาน", en: "Report" },
  navPricing: { th: "ราคา", en: "Pricing" },
  login: { th: "เข้าสู่ระบบ", en: "Log in" },
  cta: { th: "เริ่มต้นกับ DOODEE", en: "Get started with DooDee" },
  secondary: { th: "ดูภาพอ้างอิง", en: "View the preview" },
  heroChip: {
    th: "ก่อนตัดสินใจเรื่องหน้า เช็ก DOODEE ก่อน",
    en: "Check DOODEE before deciding on your face",
  },
  heroKicker: { th: "AESTHETIC ASSESSMENT · THAI/ASIAN CONTEXT", en: "AESTHETIC ASSESSMENT · THAI/ASIAN CONTEXT" },
  heroTitleAria: {
    th: "เช็กก่อนตัดสินใจเรื่องหน้า",
    en: "Check before deciding on your face",
  },
  heroTitleLineA: {
    th: "เช็กก่อน",
    en: "Check before",
  },
  heroTitleLineB: {
    th: "ตัดสินใจเรื่องหน้า",
    en: "deciding on your face",
  },
  heroBody: {
    th: "DOODEE วิเคราะห์ใบหน้าด้วย AI — อ่านโครงหน้า สัดส่วน ผิว และภาพรวม เพื่อช่วยจัดลำดับสิ่งที่ควรถามก่อนจองคลินิกหรือซื้อแพ็กเกจ",
    en: "DOODEE reads facial structure, proportion, skin signal, and overall balance to show which questions are worth discussing before you book a clinic or buy a package.",
  },
  trustA: { th: "รู้ว่าควรถามอะไร", en: "Know what to ask" },
  trustB: { th: "บริบทก่อนตัดสินใจ", en: "Context before deciding" },
  trustC: { th: "ก่อนจ่ายจริง", en: "Before paying" },
  heroProofMain: {
    th: "60+ ตัวชี้วัด จากจุดอ้างอิงบนใบหน้า 478 จุด",
    en: "60+ measurements across 478 facial landmarks",
  },
  heroProofSub: {
    th: "อธิบายวิธีวัด ขอบเขต และข้อจำกัดอย่างตรงไปตรงมา",
    en: "Methods, scope, and limits are explained directly",
  },
  transformationsKicker: { th: "REFERENCE MORPH", en: "REFERENCE MORPH" },
  transformationsTitle: {
    th: "ภาพอ้างอิงเพื่ออ่านทิศทาง ไม่ใช่คำสัญญาผลลัพธ์",
    en: "A reference morph for direction, not a promised outcome",
  },
  transformationsBody: {
    th: "ภาพก่อนและภาพอ้างอิงอยู่ในเฟรมเดียวกัน เพื่อช่วยให้เห็นความสัมพันธ์ของสัดส่วนโดยรวมและตั้งคำถามได้แม่นขึ้นก่อนปรึกษา",
    en: "Before and reference frames stay aligned so you can read proportional direction and ask better questions before a consult.",
  },
  maleTitle: { th: "ผู้ชาย: เฟรมเดียวกัน", en: "Male: same frame" },
  maleBody: {
    th: "ตำแหน่งใบหน้า คอ และไหล่อยู่ในเฟรมเดียวกันเพื่อเทียบได้ง่ายขึ้น",
    en: "Face, neck, and shoulders stay locked in one frame for cleaner comparison.",
  },
  femaleTitle: { th: "ผู้หญิง: ภาพอ้างอิงเชิงทิศทาง", en: "Female: directional reference" },
  femaleBody: {
    th: "แสดงแนวทางภาพที่ต่างกัน โดยยังคงเป็นภาพอ้างอิง ไม่ใช่ผลลัพธ์จริง",
    en: "Shows a different visual direction while remaining a reference, not a promised result.",
  },
  before: { th: "ก่อน", en: "Before" },
  after: { th: "ภาพอ้างอิง", en: "Visual reference" },
  reportKicker: { th: "วิธีทำงาน", en: "How it works" },
  reportTitle: {
    th: "วัดก่อน แล้วค่อยแนะนำ",
    en: "We measure before we suggest",
  },
  reportBody: {
    th: "ระบบอ่านโครงสร้าง สัดส่วน สัญญาณผิว และคุณภาพรูปก่อน จากนั้นจึงจัดลำดับประเด็นที่ควรสำรวจ ไม่เริ่มจากการขายหัตถการ",
    en: "The system reads structure, proportion, skin signals, and photo quality first, then ranks what is worth exploring instead of starting with a procedure sale.",
  },
  differenceKicker: { th: "ทำไมต้อง DOODEE", en: "Why DooDee" },
  differenceTitle: {
    th: "ไม่ใช่ทุกหัตถการจะเป็นจุดเริ่มต้นที่เหมาะกับทุกหน้า",
    en: "Not every procedure is the right first step for every face",
  },
  differenceBody: {
    th: "แต่ละคนอาจอยากสำรวจเรื่องผิว คาง กรอบหน้า ใต้ตา หรือแค่คุณภาพรูปและสไตล์ต่างกัน DOODEE จึงเริ่มจากภาพรวม แล้วช่วยจัดคำถามที่ควรคุยก่อน",
    en: "Different users may want to explore skin clarity, chin, jawline, under-eye balance, photo quality, or styling. DOODEE starts with the whole face, then organizes the questions worth discussing first.",
  },
  pricingKicker: { th: "ราคา", en: "Pricing" },
  pricingTitle: {
    th: "เริ่มฟรี แล้วค่อยเลือกเมื่ออยากใช้งานมากขึ้น",
    en: "Start free, then choose only when you need more",
  },
  pricingBody: {
    th: "เลือกตามจำนวนการประเมิน ภาพอ้างอิง และเครื่องมือเปรียบเทียบที่ต้องใช้จริง ราคากับโควตาดึงจากแพ็กเกจปัจจุบันโดยตรง",
    en: "Choose by the number of assessments, visual references, and comparison tools you actually need. Prices and quotas come directly from the current plan catalog.",
  },
  trustKicker: { th: "ความเป็นส่วนตัวและขอบเขต", en: "Privacy and boundaries" },
  trustTitle: {
    th: "ชัดเจนเรื่องข้อมูล ข้อจำกัด และความคาดหวัง",
    en: "Clear about privacy, limits, and expectations",
  },
  finalTitle: {
    th: "ก่อนจองคลินิก ดูว่าอะไรควรสำรวจก่อน",
    en: "Before booking a clinic, see what may be worth exploring first",
  },
  finalBody: {
    th: "ใช้รายงานส่วนตัวเป็น baseline เพื่อจัดลำดับคำถาม เปรียบเทียบทิศทาง และคุยกับแพทย์ให้ชัดก่อนตัดสินใจจ่าย",
    en: "Use your private report as a baseline to organize questions, compare directions, and have a clearer clinician conversation before spending.",
  },
};

const reportCards: IconCard[] = [
  {
    icon: <ScanLine className="h-5 w-5" />,
    title: { th: "Face baseline", en: "Face baseline" },
    body: {
      th: "ตั้งค่าพื้นฐานจากโครงหน้า สัดส่วน สัญญาณผิว และคุณภาพรูป ก่อนตีความว่าควรเริ่มจากตรงไหน",
      en: "Build a baseline from structure, proportion, skin signal, and photo quality before deciding where to start.",
    },
  },
  {
    icon: <ClipboardCheck className="h-5 w-5" />,
    title: { th: "ลำดับคำถามก่อนตัดสินใจ", en: "Decision priorities" },
    body: {
      th: "แยกเรื่องที่อยากสำรวจ สิ่งที่ควรรอดู และคำถามที่ควรถามแพทย์ก่อนเลือกหัตถการ",
      en: "Separate areas to explore, items to monitor, and questions to ask a clinician before choosing a procedure.",
    },
  },
  {
    icon: <Sparkles className="h-5 w-5" />,
    title: { th: "Directional reference", en: "Directional reference" },
    body: {
      th: "ภาพอ้างอิงช่วยอ่านทิศทางเชิงภาพเท่านั้น ไม่ใช่การพยากรณ์ผลลัพธ์หรือคำแนะนำทางการแพทย์",
      en: "Visual references help frame a direction. They are not outcome predictions or medical recommendations.",
    },
  },
];

const oldWay = [
  { th: "จ่ายก่อนรู้ priority", en: "Spending before knowing priorities" },
  { th: "เลือกหัตถการตามกระแส", en: "Choosing procedures by trend" },
  { th: "ดูแค่ฟิลเตอร์หรือ before/after", en: "Relying on filters or before/after images" },
  { th: "ปรึกษาโดยยังไม่รู้ว่าควรถามอะไร", en: "Consulting before knowing what to ask" },
];

const newWay = [
  { th: "เช็กภาพรวมก่อนใช้เงิน", en: "Check the whole face before spending" },
  { th: "รู้จุดที่คุ้มสุดสำหรับหน้า", en: "Know what is most worth it for your face" },
  { th: "เตรียมคำถามก่อนคุยคลินิก", en: "Prepare better clinic questions" },
  { th: "ค่อยเลือกแพ็กเกจหรือหัตถการ", en: "Then choose a package or procedure" },
];

const funnelSteps = [
  { th: "สร้างบัญชี", en: "Create an account" },
  { th: "เริ่มด้วย Basic 1 ครั้ง", en: "Start with one Basic assessment" },
  { th: "อ่านภาพรวมและลำดับคำถาม", en: "Read the overview and question priorities" },
  { th: "เลือก Plus หรือ Pro เมื่อจำเป็น", en: "Choose Plus or Pro only when needed" },
];

const faqItems: FaqItem[] = [
  {
    q: { th: "DOODEE เป็นคำแนะนำทางการแพทย์ไหม?", en: "Is DOODEE medical advice?" },
    a: {
      th: "ไม่ใช่ เป็นเครื่องมือช่วยตัดสินใจก่อนปรึกษาผู้เชี่ยวชาญ การทำหัตถการหรือศัลยกรรมต้องคุยกับแพทย์ที่มีใบประกอบวิชาชีพ",
      en: "No. It is decision support before a professional consultation. Procedures or surgery require a licensed clinician.",
    },
  },
  {
    q: { th: "ควรตีความภาพอ้างอิงอย่างไร?", en: "How should I read the visual reference?" },
    a: {
      th: "ภาพนี้เป็นภาพอ้างอิงเชิงทิศทางสำหรับตั้งคำถามก่อนตัดสินใจ ไม่ใช่ผลลัพธ์จริงหรือคำแนะนำให้ทำหัตถการ",
      en: "It is a directional reference for better questions before deciding, not a predicted outcome or a recommendation to proceed.",
    },
  },
  {
    q: { th: "ข้อมูลรูปหน้าปลอดภัยแค่ไหน?", en: "How private is the face photo?" },
    a: {
      th: "ระบบออกแบบให้ลดการเก็บข้อมูลที่ไม่จำเป็น และสื่อสารข้อจำกัดอย่างตรงไปตรงมา",
      en: "The product is designed to minimize unnecessary storage and communicate limitations clearly.",
    },
  },
  {
    q: { th: "ทำไมต้องเน้นบริบทไทย/เอเชีย?", en: "Why Thai/Asian context?" },
    a: {
      th: "เพราะมาตรฐานความงามและสัดส่วนใบหน้าที่คนใช้ตัดสินใจควรสัมพันธ์กับบริบทของผู้ใช้ ไม่ใช่ยืมกรอบเดียวจากทุกตลาด",
      en: "Because appearance decisions should reflect the user's context instead of applying one broad standard to every market.",
    },
  },
];

export function LandingHero() {
  const { lang, setLang } = useT();
  const rootRef = useRef<HTMLElement | null>(null);
  useScrollReveal(rootRef);

  return (
    <main ref={rootRef} className="qoves-landing relative isolate min-h-[100svh] overflow-x-hidden bg-[#050816] text-[#f8fafc]">
      <LandingAtmosphere />
      <Header lang={lang} setLang={setLang} />
      <section className="landing-dark-chapter theme-locked-dark relative z-10 mx-auto flex min-h-[100svh] w-full max-w-[88rem] flex-col px-4 pb-4 pt-[9.25rem] sm:px-8 sm:pb-5 sm:pt-[8.5rem] lg:px-10 lg:pt-[6.75rem]">
        <HeroSection lang={lang} />
      </section>
      <div className="landing-clinical-shell relative z-10">
        <div className="landing-render-budget">
          <LandingProcedurePreview lang={lang} />
        </div>
        <div className="landing-render-budget">
          <SampleReportSection lang={lang} />
        </div>
        <div id="how-it-works" className="landing-render-budget">
          <ReportSection lang={lang} />
        </div>
        <div className="landing-render-budget">
          <DifferenceSection lang={lang} />
        </div>
        <div className="landing-render-budget">
          <CredibilityStrip lang={lang} />
        </div>
        <div className="landing-render-budget">
          <PricingSection lang={lang} />
        </div>
        <div className="landing-render-budget">
          <TrustFaqSection lang={lang} />
        </div>
        <div className="landing-render-budget">
          <FinalCta lang={lang} />
        </div>
      </div>
    </main>
  );
}

function LandingAtmosphere() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPlayback = () => {
      if (media.matches || document.hidden) {
        video.pause();
        return;
      }
      void video.play().catch(() => undefined);
    };

    syncPlayback();
    media.addEventListener("change", syncPlayback);
    document.addEventListener("visibilitychange", syncPlayback);

    return () => {
      media.removeEventListener("change", syncPlayback);
      document.removeEventListener("visibilitychange", syncPlayback);
    };
  }, []);

  return (
    <div
      aria-hidden
      data-landing-video-shell
      className="landing-hero-video pointer-events-none absolute inset-x-0 top-0 z-0 h-[100dvh] w-full overflow-hidden"
    >
      <video
        ref={videoRef}
        data-landing-background-video
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className="absolute inset-0 h-full w-full object-cover object-[58%_50%] opacity-100"
      >
        <source src="/videos/landing-hero.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,4,12,0.42)_0%,rgba(2,4,12,0.31)_38%,rgba(2,4,12,0.18)_78%,rgba(2,4,12,0.28)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#050816] via-[#050816]/30 to-transparent" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,4,12,0.08),transparent_34%,rgba(2,4,12,0.16))]" />
    </div>
  );
}

function Header({
  lang,
  setLang,
}: {
  lang: Lang;
  setLang: (lang: Lang) => void;
}) {
  const [compact, setCompact] = useState(false);
  const [activeSection, setActiveSection] = useState("");
  const navItems = [
    { id: "report", label: copy.navReport[lang] },
    { id: "how-it-works", label: copy.navHow[lang] },
    { id: "why-doodee", label: copy.navWhy[lang] },
    { id: "pricing", label: copy.navPricing[lang] },
    { id: "faq", label: copy.navFaq[lang] },
  ];

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      setCompact(window.scrollY > NAV_COMPACT_THRESHOLD);
      if (window.scrollY < window.innerHeight * 0.55) {
        setActiveSection("");
      }
    };
    const onScroll = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (LANDING_NAV_SECTION_IDS.some((id) => id === hash)) {
      setActiveSection(hash);
    }
    if (!("IntersectionObserver" in window)) return;

    const targets = LANDING_NAV_SECTION_IDS
      .map((id) => document.getElementById(id))
      .filter((target): target is HTMLElement => target !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveSection(visible.target.id);
      },
      {
        rootMargin: "-96px 0px -62% 0px",
        threshold: [0.08, 0.24, 0.5],
      }
    );

    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  const jumpToSection = useCallback(
    (event: ReactMouseEvent<HTMLAnchorElement>, id: string) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = document.getElementById(id);
      if (!target) return;

      event.preventDefault();
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      target.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
      window.history.replaceState(null, "", `#${id}`);
      setActiveSection(id);
    },
    []
  );

  return (
    <header
      data-landing-keyword-header
      data-compact={compact ? "true" : "false"}
      className="landing-keyword-header theme-locked-dark pointer-events-none fixed inset-x-0 top-0 z-[80] px-2 pt-[max(env(safe-area-inset-top),0px)] sm:px-4"
    >
      <div className="landing-keyword-nav pointer-events-auto mx-auto w-full">
        <Link
          href={"/" as never}
          className="landing-nav-logo group inline-flex min-h-11 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/55"
          aria-label="DOODEE home"
        >
          <DoodeeLogo
            className="landing-nav-logo-lockup"
            markClassName="h-8 w-8 rounded-lg sm:h-10 sm:w-10 sm:rounded-xl"
            wordmarkClassName="landing-nav-wordmark text-[1.45rem] text-white/92 group-hover:text-white sm:text-[1.65rem]"
          />
        </Link>

        <nav
          aria-label={lang === "th" ? "ไปยังส่วนต่าง ๆ ของหน้า" : "On this page"}
          className="landing-keyword-links no-scrollbar"
        >
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(event) => jumpToSection(event, item.id)}
              aria-current={activeSection === item.id ? "location" : undefined}
              className="landing-keyword-link"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="landing-nav-actions flex items-center justify-end gap-2">
          <Link
            href={"/login" as never}
            className="landing-nav-login hidden min-h-11 items-center px-3 text-sm font-medium text-white/72 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55 lg:inline-flex"
          >
            {copy.login[lang]}
          </Link>
          <div className="landing-nav-language">
            <LangToggle variant="inverted" />
          </div>
          <button
            type="button"
            onClick={() => setLang(lang === "th" ? "en" : "th")}
            aria-label={lang === "th" ? "Switch to English" : "เปลี่ยนเป็นภาษาไทย"}
            className="landing-nav-language-compact"
          >
            {lang === "th" ? "EN" : "TH"}
          </button>
          <Link
            href={LOGIN_HREF}
            aria-label={copy.navCta[lang]}
            className="landing-nav-cta inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#f8fafc] px-3 text-sm font-semibold text-[#0d0b1f] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050816] sm:px-5"
          >
            <span className="sm:hidden">{lang === "th" ? "เริ่ม" : "Start"}</span>
            <span className="hidden sm:inline">{copy.navCta[lang]}</span>
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}

function HeroSection({ lang }: { lang: Lang }) {
  const router = useRouter();
  const prefetchStart = useCallback(() => {
    router.prefetch(LOGIN_HREF);
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ric = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof ric.requestIdleCallback === "function") {
      const id = ric.requestIdleCallback(prefetchStart, { timeout: 1800 });
      return () => {
        if (typeof ric.cancelIdleCallback === "function") {
          ric.cancelIdleCallback(id);
        }
      };
    }
    const id = window.setTimeout(prefetchStart, 500);
    return () => window.clearTimeout(id);
  }, [prefetchStart]);

  return (
    <div className="flex flex-1 items-center pb-10 pt-4 sm:pb-12 sm:pt-6 lg:py-10">
      <div className="max-w-3xl lg:pl-8">
        <span data-reveal style={{ "--reveal-delay": "30ms" } as CSSProperties} className="liquid-glass inline-flex rounded-full px-3.5 py-1 text-[0.72rem] font-medium text-white/88">
          {copy.heroChip[lang]}
        </span>
        <h1 aria-label={copy.heroTitleAria[lang]} className="landing-hero-title mt-5 max-w-[11ch] font-serif text-[3.35rem] font-normal leading-[0.93] tracking-normal text-white sm:text-[5.25rem] lg:text-[6.1rem] xl:text-[6.75rem]">
          <BlurText text={copy.heroTitleLineA[lang]} className="block" />
          {" "}
          <BlurText text={copy.heroTitleLineB[lang]} className="block" delay={0.08} />
        </h1>
        <p data-reveal style={{ "--reveal-delay": "140ms" } as CSSProperties} className="mt-5 max-w-[40rem] text-pretty text-base leading-7 text-[#b8bfd4] sm:mt-6 sm:text-lg sm:leading-8">
          {copy.heroBody[lang]}
        </p>
        <div data-reveal style={{ "--reveal-delay": "210ms" } as CSSProperties} className="mt-6 flex flex-col gap-2.5 sm:mt-8 sm:flex-row">
          <Link href={LOGIN_HREF} onPointerEnter={prefetchStart} onFocus={prefetchStart} className="landing-primary-cta doodee-press group inline-flex min-h-12 items-center justify-center gap-4 rounded-full bg-[#111411] py-2 pl-7 pr-2 text-base font-semibold text-white shadow-[0_18px_50px_rgba(17,20,17,0.22)] transition-transform duration-200 hover:scale-[1.01] hover:bg-[#24443f] active:scale-[0.98] sm:min-h-14">
            {copy.cta[lang]}
            <span className="landing-primary-cta-icon grid h-10 w-10 place-items-center rounded-full bg-white text-[#111411]">
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
          <a href="#preview" className="liquid-glass doodee-press inline-flex min-h-12 items-center justify-center rounded-full px-8 text-base font-semibold text-white/78 transition-colors hover:text-white sm:min-h-14">
            {copy.secondary[lang]}
          </a>
        </div>
        <div data-reveal style={{ "--reveal-delay": "240ms" } as CSSProperties} className="mt-4 inline-flex max-w-full items-center gap-3 rounded-full border border-white/12 bg-white/[0.055] px-4 py-2.5 text-left shadow-[0_18px_54px_-36px_rgba(168,85,247,0.72)] backdrop-blur-md">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet/18 text-[#d8b4fe]">
            <BadgeCheck className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-5 text-white sm:text-base">
              {copy.heroProofMain[lang]}
            </span>
            <span className="block text-[0.72rem] leading-4 text-white/58 sm:text-xs">
              {copy.heroProofSub[lang]}
            </span>
          </span>
        </div>
        <div data-reveal style={{ "--reveal-delay": "270ms" } as CSSProperties} className="mt-5 flex flex-wrap gap-2.5 sm:mt-6">
          {[
            { icon: ScanLine, text: copy.trustA[lang] },
            { icon: ClipboardCheck, text: copy.trustB[lang] },
            { icon: ShieldCheck, text: copy.trustC[lang] },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <span key={item.text} className="liquid-glass inline-flex min-h-9 items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-[#e4d6ff] sm:text-sm">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-violet/18 text-violet">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                </span>
                {item.text}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ReportSection({ lang }: { lang: Lang }) {
  return (
    <section id="product" className="landing-clinical-section mx-auto w-full max-w-[88rem] px-5 py-20 sm:px-8 sm:py-28 lg:px-10 lg:py-36">
      <SectionHeader kicker={copy.reportKicker[lang]} title={copy.reportTitle[lang]} body={copy.reportBody[lang]} />
      <div data-reveal className="mt-12 border-y border-[#071225]/14 md:grid md:grid-cols-3">
        {reportCards.map((item, index) => (
          <article key={item.title.en} className="border-b border-[#071225]/14 py-8 last:border-b-0 md:border-b-0 md:border-r md:px-7 md:last:border-r-0 lg:px-9 lg:py-10">
            <div className="flex items-center justify-between gap-4">
              <span className="font-display text-3xl font-semibold text-[#087e8b] tabular-nums">0{index + 1}</span>
              <span className="text-[#087e8b]" aria-hidden>{item.icon}</span>
            </div>
            <h3 className="mt-12 max-w-[10ch] font-display text-3xl font-semibold leading-tight tracking-normal text-[#071225] sm:text-4xl">
              {item.title[lang]}
            </h3>
            <p className="mt-5 max-w-sm text-base leading-7 text-[#53616d]">{item.body[lang]}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function DifferenceSection({ lang }: { lang: Lang }) {
  return (
    <section id="why-doodee" className="landing-clinical-section mx-auto w-full max-w-[88rem] px-5 py-20 sm:px-8 sm:py-28 lg:px-10 lg:py-36">
      <SectionHeader kicker={copy.differenceKicker[lang]} title={copy.differenceTitle[lang]} body={copy.differenceBody[lang]} />
      <div data-reveal className="mt-12 grid border-y border-[#071225]/14 md:grid-cols-2">
        <PathCard title={lang === "th" ? "ก่อนใช้ DOODEE" : "Before DooDee"} items={oldWay.map((item) => item[lang])} muted />
        <PathCard title={lang === "th" ? "เมื่อใช้ DOODEE" : "With DooDee"} items={newWay.map((item) => item[lang])} />
      </div>
    </section>
  );
}

function PathCard({ title, items, muted = false }: { title: string; items: string[]; muted?: boolean }) {
  return (
    <article className={`py-8 md:px-8 md:py-10 lg:px-10 ${muted ? "border-b border-[#071225]/14 md:border-b-0 md:border-r" : ""}`}>
      <h3 className={`font-display text-3xl font-semibold tracking-normal sm:text-4xl ${muted ? "text-[#65727d]" : "text-[#071225]"}`}>{title}</h3>
      <ul className="mt-8">
        {items.map((item, index) => (
          <li key={item} className="grid min-h-16 grid-cols-[2rem_1fr] items-center border-b border-[#071225]/10 py-3 text-base leading-6 last:border-b-0">
            <span className={`text-sm font-semibold tabular-nums ${muted ? "text-[#8a959e]" : "text-[#087e8b]"}`}>0{index + 1}</span>
            <span className={muted ? "text-[#65727d]" : "font-medium text-[#243443]"}>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function PricingSection({ lang }: { lang: Lang }) {
  const plans = getAllPlans();

  return (
    <section id="pricing" className="landing-clinical-section mx-auto w-full max-w-[88rem] px-5 py-20 sm:px-8 sm:py-28 lg:px-10 lg:py-36">
      <SectionHeader
        kicker={copy.pricingKicker[lang]}
        title={copy.pricingTitle[lang]}
        body={copy.pricingBody[lang]}
      />
      <div data-reveal className="mt-12 border-y border-[#071225]/14 lg:grid lg:grid-cols-3">
        {plans.map((plan) => {
          const name = lang === "th" ? plan.label_th : plan.label_en;
          const blurb = lang === "th" ? plan.blurb_th : plan.blurb_en;
          return (
            <article
              key={plan.tier}
              data-testid="landing-pricing-card"
              data-recommended={plan.recommended ? "true" : "false"}
              className={`landing-pricing-card relative border-b border-[#071225]/14 py-8 last:border-b-0 lg:border-b-0 lg:border-r lg:px-8 lg:last:border-r-0 ${plan.recommended ? "lg:bg-[#e9f3f4]" : ""}`}
            >
              {plan.recommended ? (
                <span className="mb-5 inline-flex rounded-full bg-[#087e8b] px-3 py-1 text-xs font-semibold text-white">
                  {lang === "th" ? "แนะนำ" : "Recommended"}
                </span>
              ) : null}
              <h3 className="font-display text-4xl font-semibold tracking-normal text-[#071225]">{name}</h3>
              <p className="mt-5 flex items-baseline gap-2 text-[#071225] tabular-nums">
                <span className="text-lg font-semibold">฿</span>
                <span className="font-display text-6xl font-semibold leading-none">{plan.priceThb}</span>
                <span className="text-sm text-[#65727d]">{plan.tier === "free" ? "" : lang === "th" ? "/ เดือน" : "/ month"}</span>
              </p>
              <p className="mt-5 min-h-[3.5rem] text-sm leading-6 text-[#53616d]">{blurb}</p>
              <dl className="mt-7 border-t border-[#071225]/12">
                <div className="flex min-h-12 items-center justify-between border-b border-[#071225]/12 text-sm">
                  <dt className="text-[#65727d]">{lang === "th" ? "การประเมิน" : "Assessments"}</dt>
                  <dd className="font-semibold text-[#071225]">{plan.scansQuota}</dd>
                </div>
                <div className="flex min-h-12 items-center justify-between border-b border-[#071225]/12 text-sm">
                  <dt className="text-[#65727d]">{lang === "th" ? "ภาพอ้างอิง" : "Visual references"}</dt>
                  <dd className="font-semibold text-[#071225]">{plan.previewsQuota}</dd>
                </div>
                <div className="flex min-h-12 items-center justify-between border-b border-[#071225]/12 text-sm">
                  <dt className="text-[#65727d]">PDF</dt>
                  <dd className="font-semibold text-[#071225]">{plan.features.pdfExport ? "✓" : "—"}</dd>
                </div>
                <div className="flex min-h-12 items-center justify-between border-b border-[#071225]/12 text-sm">
                  <dt className="text-[#65727d]">{lang === "th" ? "เปรียบเทียบหลายรูป" : "Multi-photo compare"}</dt>
                  <dd className="font-semibold text-[#071225]">{plan.features.multiPhotoCompare ? "✓" : "—"}</dd>
                </div>
              </dl>
              <Link href={LOGIN_HREF} className={`landing-pricing-cta doodee-press mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087e8b] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f4f7f7] ${plan.recommended ? "bg-[#071225] text-white hover:bg-[#102541]" : "border border-[#071225]/18 text-[#071225] hover:bg-white"}`}>
                {lang === "th" ? `เริ่มต้น ${name}` : `Start ${name}`}
                <ArrowRight className="landing-pricing-cta-icon h-4 w-4" aria-hidden />
              </Link>
            </article>
          );
        })}
      </div>

      <div data-reveal className="mt-10">
        <h3 className="font-display text-3xl font-semibold tracking-normal text-[#071225]">
          {lang === "th" ? "เริ่มก่อน แล้วค่อยเลือกแพ็ก" : "Start first, choose a plan later"}
        </h3>
        <ol className="mt-6 grid border-y border-[#071225]/14 md:grid-cols-4">
          {funnelSteps.map((step, index) => (
            <li key={step.en} className="grid min-h-20 grid-cols-[2.25rem_1fr] items-center border-b border-[#071225]/12 py-4 last:border-b-0 md:border-b-0 md:border-r md:px-5 md:last:border-r-0">
              <span className="font-display text-2xl font-semibold text-[#087e8b] tabular-nums">0{index + 1}</span>
              <span className="text-sm font-semibold leading-6 text-[#243443]">{step[lang]}</span>
            </li>
          ))}
        </ol>
        {promptPayCheckoutEnabled ? (
          <p className="mt-5 max-w-4xl text-sm leading-6 text-[#65727d]">
            {lang === "th"
              ? "PromptPay เป็นการจ่ายครั้งเดียวเพื่อรับสิทธิ์ 30 วัน ส่วนบัตรเป็นสมาชิกรายเดือน ผู้ใช้ใหม่ที่มีสิทธิ์อาจได้รับข้อเสนอ Plus 29 บาทผ่าน PromptPay หลังดู report teaser โดยไม่ต่ออายุอัตโนมัติ"
              : "PromptPay is one payment for 30 days; card checkout renews monthly. Eligible first-time users may receive a ฿29 Plus PromptPay offer after viewing the report teaser, with no automatic renewal."}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function TrustFaqSection({ lang }: { lang: Lang }) {
  return (
    <section id="faq" className="landing-clinical-section mx-auto w-full max-w-[88rem] px-5 py-20 sm:px-8 sm:py-28 lg:px-10 lg:py-36">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-32">
          <SectionHeader kicker={copy.trustKicker[lang]} title={copy.trustTitle[lang]} />
          <div className="mt-10 border-t border-[#071225]/14">
            {[
              { icon: <LockKeyhole className="h-5 w-5" />, title: { th: "ลดการเก็บข้อมูลที่ไม่จำเป็น", en: "Minimize unnecessary data" } },
              { icon: <ShieldCheck className="h-5 w-5" />, title: { th: "ไม่แทนคำปรึกษาแพทย์", en: "Does not replace a clinician" } },
              { icon: <Stethoscope className="h-5 w-5" />, title: { th: "ช่วยเตรียมคำถามก่อนปรึกษา", en: "Helps prepare consultation questions" } },
            ].map((item) => (
              <div key={item.title.en} className="flex min-h-20 items-center gap-4 border-b border-[#071225]/14 py-4 text-base font-semibold text-[#243443]">
                <span className="grid h-10 w-10 shrink-0 place-items-center text-[#087e8b]">
                  {item.icon}
                </span>
                {item.title[lang]}
              </div>
            ))}
          </div>
          </div>
        </div>
        <div className="border-t border-[#071225]/14 lg:col-span-8">
          {faqItems.map((item, index) => (
            <HoverFaqItem key={item.q.en} item={item} index={index} lang={lang} />
          ))}
        </div>
      </div>
    </section>
  );
}

function HoverFaqItem({ item, index, lang }: { item: FaqItem; index: number; lang: Lang }) {
  const [hovered, setHovered] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const open = hovered || manualOpen;
  const answerId = `landing-faq-answer-${index}`;

  return (
    <div
      data-testid="landing-faq-item"
      className={`landing-faq-item border-b border-[#071225]/14 ${open ? "is-open" : ""}`}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setHovered(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={answerId}
        onClick={() => {
          if (manualOpen) {
            setManualOpen(false);
            setHovered(false);
            return;
          }
          setManualOpen(true);
        }}
        className="landing-faq-trigger flex min-h-20 w-full items-center justify-between gap-5 py-5 text-left text-lg font-semibold text-[#071225] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087e8b] focus-visible:ring-offset-4 focus-visible:ring-offset-[#f4f7f7] sm:text-xl"
      >
        <span>{item.q[lang]}</span>
        <span className="landing-faq-plus grid h-11 w-11 shrink-0 place-items-center text-2xl font-normal text-[#087e8b]" aria-hidden>
          +
        </span>
      </button>
      <div id={answerId} className="landing-faq-answer-grid" aria-hidden={!open}>
        <div className="overflow-hidden">
          <p className="max-w-3xl pb-7 pr-16 text-base leading-7 text-[#53616d]">{item.a[lang]}</p>
        </div>
      </div>
    </div>
  );
}

function FinalCta({ lang }: { lang: Lang }) {
  return (
    <section className="mx-auto w-full max-w-[88rem] px-5 pb-8 pt-12 sm:px-8 sm:pb-10 lg:px-10 lg:pt-16">
      <div className="qoves-dark-panel overflow-hidden rounded-2xl bg-[#071225] p-8 text-white sm:p-12 lg:p-16">
        <div data-reveal className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <DoodeeLogo
              className="qoves-dark-subtle mb-6 rounded-full bg-white/10 px-3 py-1.5"
              markClassName="h-5 w-5 rounded-lg"
              wordmarkClassName="text-sm text-white/75"
            />
            <h2 className="font-display text-[2.65rem] font-semibold leading-[1.02] tracking-normal sm:text-6xl sm:leading-none lg:text-7xl">
              {copy.finalTitle[lang]}
            </h2>
            <p className="qoves-dark-muted mt-6 max-w-2xl text-lg leading-8 text-white/70">{copy.finalBody[lang]}</p>
          </div>
          <Link href={LOGIN_HREF} className="qoves-light-button doodee-press inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-white px-7 text-base font-semibold text-[#111411] transition-transform hover:scale-[1.01] active:scale-[0.98]">
            {copy.cta[lang]}
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
        <div className="mt-10 border-t border-white/[0.12] pt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/78">
            {lang === "th" ? "คู่มือยอดนิยม" : "Popular guides"}
          </p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
            {SEO_TOPICS.map((topic) => (
              <Link
                key={topic.slug}
                href={`/topics/${topic.slug}` as never}
                className="inline-flex min-h-10 items-center border-b border-white/20 text-sm font-medium text-white/72 transition hover:border-white/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/45"
              >
                {topic.headline}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHeader({ kicker, title, body }: { kicker: string; title: string; body?: string }) {
  return (
    <div data-reveal className="max-w-4xl">
      <div className="landing-section-label">{kicker}</div>
      <h2 className="mt-5 max-w-[15ch] text-balance font-display text-[2.75rem] font-semibold leading-[0.98] tracking-normal text-[#071225] sm:text-5xl md:text-6xl lg:text-[4.5rem]">
        {title}
      </h2>
      {body ? <p className="mt-6 max-w-3xl text-pretty text-base leading-7 text-[#53616d] sm:text-lg sm:leading-8">{body}</p> : null}
    </div>
  );
}
