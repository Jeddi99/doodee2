/**
 * Phase 613 — Public SEO pages (topics / blog / faq) now share the SAME
 * theme-aware background as the real app instead of a locked dark navy
 * gradient. The `app-bg-*` classes resolve per theme in globals.css
 * (dark default, `html.light` overrides), so these pages follow the
 * user's theme exactly like /scan and /surgery do.
 */
export function PublicPageBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
      <div className="app-bg-base absolute inset-0" />
      <div className="app-bg-violet-blob absolute inset-x-[-30%] top-[-18%] h-[34rem] rounded-full opacity-[0.22] md:inset-x-[-12%] md:top-[-32%] md:opacity-[0.20]" />
      <div className="app-bg-cyan-blob absolute right-[-42%] top-[12%] h-[28rem] w-[28rem] rounded-full opacity-[0.18] md:right-[-10%] md:top-[4%] md:h-[34rem] md:w-[34rem] md:opacity-[0.14]" />
      <div className="app-bg-grid absolute inset-0 opacity-[0.10]" />
    </div>
  );
}
