"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Clock } from "lucide-react";
import { LandingNav } from "@/components/marketing/LandingNav";
import { PublicPageBackdrop } from "@/components/marketing/PublicPageBackdrop";
import { BLOG_POSTS } from "./blog-data";

export function BlogIndexPage() {
  const featured = BLOG_POSTS[0];
  const rest = BLOG_POSTS.slice(1);

  return (
    <main className="app-glass-page relative min-h-[100dvh] overflow-x-hidden bg-transparent text-[#241f1a]">
      <PublicPageBackdrop />
      <LandingNav />

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-32 pt-12 sm:px-10 sm:pt-20">
        <header className="space-y-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#056f82]">
            คลังความรู้
          </p>
          <h1 className="font-serif text-5xl font-light italic leading-tight sm:text-6xl">
            เข้าใจผลสแกนก่อนตัดสินใจ
          </h1>
          <p className="mx-auto max-w-xl text-sm leading-relaxed text-[#625a52] sm:text-base">
            บทความสั้นจาก DOODEE เรื่องรูปถ่าย คุณภาพข้อมูล เมตริกใบหน้า และการอ่านผลอย่างมีสติ
          </p>
        </header>

        {featured && (
          <Link
            href={`/blog/${featured.slug}` as never}
            className="group mt-12 block overflow-hidden rounded-3xl border border-white/60 bg-white/50 p-8 shadow-[0_24px_70px_-52px_rgba(36,31,26,0.44)] backdrop-blur-md transition hover:border-[#067e96]/25 hover:bg-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35 sm:p-10"
          >
            <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#056f82]">
              <BookOpen className="h-3 w-3" />
              แนะนำให้อ่านก่อน · {featured.category}
            </p>
            <h2 className="mt-3 font-serif text-3xl font-light italic leading-tight text-[#241f1a] transition sm:text-4xl">
              {featured.title}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#625a52] sm:text-base">
              {featured.excerpt}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-[#7a7067]">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {featured.readMinutes} นาที
              </span>
              <span className="tabular-nums">
                {formatDate(featured.publishedAt)}
              </span>
              <span className="ml-auto inline-flex min-h-[44px] items-center gap-1 rounded-full px-1 font-semibold text-[#056f82] group-hover:underline">
                อ่านฉบับเต็ม
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
        )}

        <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/blog/${p.slug}` as never}
                className="group flex h-full flex-col rounded-2xl border border-white/60 bg-white/50 p-6 shadow-[0_18px_50px_-44px_rgba(36,31,26,0.36)] backdrop-blur-md transition hover:border-[#067e96]/20 hover:bg-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35"
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#056f82]">
                  {p.category}
                </p>
                <h3 className="mt-2 font-serif text-xl font-light italic leading-snug text-[#241f1a] transition">
                  {p.title}
                </h3>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[#514942]">
                  {p.excerpt}
                </p>
                <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-[11px] text-[#7a7067]">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {p.readMinutes} นาที
                  </span>
                  <span className="tabular-nums">
                    {formatDate(p.publishedAt)}
                  </span>
                </div>
                <span className="mt-4 inline-flex min-h-[44px] items-center gap-1 self-start rounded-full text-sm font-semibold text-[#056f82] group-hover:underline">
                  อ่านต่อ
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <section className="mt-16 rounded-3xl border border-white/60 bg-white/50 p-8 text-center shadow-[0_20px_60px_-46px_rgba(36,31,26,0.42)] backdrop-blur-md">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#056f82]">
            พร้อมเริ่มประเมินเบื้องต้น?
          </p>
          <h3 className="mt-2 font-serif text-2xl font-light italic">
            สแกนแบบส่วนตัว แล้วอ่านผลทีละส่วน
          </h3>
          <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={"/scan" as never}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#241f1a] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#342d27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35 sm:w-auto"
            >
              เริ่มประเมินใบหน้า
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href={"/faq" as never}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-white/60 bg-white/45 px-5 py-2.5 text-sm text-[#4d453e] shadow-[0_12px_30px_-26px_rgba(36,31,26,0.34)] backdrop-blur transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35 sm:w-auto"
            >
              อ่าน FAQ
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("th-TH", {
      calendar: "gregory",
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
