"use client";

import { ShieldCheck, Lock, Eye, Database, Mail } from "lucide-react";
import { useT } from "@/lib/i18n";

export function PrivacyPage() {
  const { t } = useT();
  return (
    <main className="public-glass-page relative isolate min-h-[100dvh] overflow-hidden bg-[#050816] px-4 py-10 text-[#f8fafc] sm:px-6 sm:py-14">
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="privacy-backdrop-base absolute inset-0 bg-[linear-gradient(135deg,#050816_0%,#070B1A_42%,#0B1020_100%)]" />
        <div className="absolute left-[-12rem] top-[-16rem] h-[34rem] w-[34rem] rounded-full bg-violet/12 blur-[8px]" />
        <div className="absolute right-[-14rem] top-[16%] h-[32rem] w-[32rem] rounded-full bg-cyan/[0.10] blur-[8px]" />
        <div className="absolute inset-0 opacity-[0.10] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan/25 bg-cyan/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan shadow-[0_0_34px_rgba(6,182,212,0.14)] backdrop-blur-md">
            <ShieldCheck className="h-3 w-3" />
            {t.privacy.eyebrow}
          </div>
          <h1 className="font-serif text-4xl font-light italic leading-tight text-[#f8fafc] md:text-5xl">
            {t.privacy.title}
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-[#f8fafc]/65 md:text-base">
            {t.privacy.intro}
          </p>
        </header>

        <Section icon={<Eye className="h-4 w-4" />} title={t.privacy.s1Title}>
          <p>{t.privacy.s1Body}</p>
        </Section>

        <Section icon={<Lock className="h-4 w-4" />} title={t.privacy.s2Title}>
          <p>{t.privacy.s2Body}</p>
        </Section>

        <Section
          icon={<Database className="h-4 w-4" />}
          title={t.privacy.s3Title}
        >
          {t.privacy.s3Body.split("\n\n").map((para, i) => (
            <p key={i} className="whitespace-pre-line">
              {para}
            </p>
          ))}
        </Section>

        <Section icon={<Mail className="h-4 w-4" />} title={t.privacy.s4Title}>
          <p>{t.privacy.s4Body}</p>
        </Section>

        <footer className="pt-4 text-xs leading-relaxed text-[#f8fafc]/38">
          {t.privacy.updated}
        </footer>
      </div>
    </main>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-[#f8fafc]/[0.10] bg-[#f8fafc]/[0.06] p-5 shadow-[0_24px_80px_-58px_rgba(0,0,0,0.92)] backdrop-blur-md">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan/20 bg-cyan/[0.10] text-cyan backdrop-blur-md">
          {icon}
        </span>
        <h2 className="text-base font-semibold text-[#f8fafc]">{title}</h2>
      </div>
      <div className="space-y-2 text-sm leading-relaxed text-[#f8fafc]/62">
        {children}
      </div>
    </section>
  );
}
