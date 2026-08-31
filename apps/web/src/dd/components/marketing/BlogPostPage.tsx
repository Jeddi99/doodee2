"use client";

import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import { LandingNav } from "@/components/marketing/LandingNav";
import { PublicPageBackdrop } from "@/components/marketing/PublicPageBackdrop";
import type { BlogPost } from "./blog-data";

export type { BlogPost };
export { BLOG_POSTS } from "./blog-data";

export function BlogPostPage({ post }: { post: BlogPost }) {
  return (
    <main className="app-glass-page relative min-h-[100dvh] overflow-x-hidden bg-transparent text-[#241f1a]">
      <PublicPageBackdrop />
      <LandingNav />

      <article className="relative z-10 mx-auto max-w-3xl px-6 pb-32 pt-8 sm:px-8 sm:pt-12">
        <Link
          href={"/blog" as never}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/60 bg-white/50 px-3 py-2 text-xs text-[#625a52] shadow-[0_12px_30px_-26px_rgba(36,31,26,0.34)] backdrop-blur transition hover:bg-white/70 hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35"
        >
          <ArrowLeft className="h-3 w-3" />
          กลับไปคลังบทความ
        </Link>

        <header className="mt-8 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#056f82]">
            {post.category}
          </p>
          <h1 className="font-serif text-4xl font-light italic leading-tight text-[#241f1a] sm:text-5xl">
            {post.title}
          </h1>
          <div className="flex items-center gap-4 text-xs text-[#8a7e74]">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {post.readMinutes} นาที
            </span>
            <span className="tabular-nums">
              {new Date(post.publishedAt).toLocaleDateString("th-TH", {
                calendar: "gregory",
                timeZone: "Asia/Bangkok",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
          <p className="rounded-3xl border border-white/60 bg-white/50 px-5 py-4 text-base leading-relaxed text-[#514942] shadow-[0_16px_48px_-42px_rgba(36,31,26,0.36)] backdrop-blur-md sm:text-lg">
            {post.excerpt}
          </p>
        </header>

        <div className="mt-10 space-y-7 text-[#342d27]">
          {post.body.map((b, i) => {
            if (b.kind === "h2") {
              return (
                <h2
                  key={i}
                  className="font-serif text-2xl font-light italic text-[#241f1a] sm:text-3xl"
                >
                  {b.text}
                </h2>
              );
            }
            if (b.kind === "p") {
              return (
                <p key={i} className="text-base leading-[1.9] text-[#3f3832] sm:text-[17px]">
                  {b.text}
                </p>
              );
            }
            if (b.kind === "ul") {
              return (
                <ul key={i} className="space-y-3 rounded-3xl border border-white/60 bg-white/50 px-5 py-5 text-[15px] text-[#3f3832] shadow-[0_16px_48px_-42px_rgba(36,31,26,0.34)] backdrop-blur-md">
                  {b.items.map((it, j) => (
                    <li key={j} className="flex gap-3">
                      <span className="mt-2.5 h-1 w-1 flex-none rounded-full bg-[#056f82]" />
                      <span className="leading-relaxed">{it}</span>
                    </li>
                  ))}
                </ul>
              );
            }
            if (b.kind === "quote") {
              return (
                <blockquote
                  key={i}
                  className="rounded-2xl border-l-4 border-[#067e96] bg-white/55 px-5 py-4 font-serif text-lg italic text-[#342d27] shadow-[0_16px_44px_-40px_rgba(36,31,26,0.34)] backdrop-blur-md"
                >
                  {b.text}
                </blockquote>
              );
            }
            return null;
          })}
        </div>

        <section className="mt-16 rounded-3xl border border-white/60 bg-white/50 p-8 text-center shadow-[0_20px_60px_-46px_rgba(36,31,26,0.42)] backdrop-blur-md">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#056f82]">
            ขั้นต่อไป
          </p>
          <h3 className="mt-2 font-serif text-2xl font-light italic">
            เริ่มรายงานใบหน้าแบบส่วนตัว
          </h3>
          <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={"/scan" as never}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#241f1a] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#342d27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35 sm:w-auto"
            >
              เริ่มประเมินใบหน้า
            </Link>
            <Link
              href={"/blog" as never}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-white/60 bg-white/45 px-5 py-2.5 text-sm text-[#4d453e] shadow-[0_12px_30px_-26px_rgba(36,31,26,0.34)] backdrop-blur transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35 sm:w-auto"
            >
              อ่านบทความเพิ่มเติม
            </Link>
          </div>
        </section>
      </article>
    </main>
  );
}
