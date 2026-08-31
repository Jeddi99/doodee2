/**
 * Ported from `doodee/tailwind.config.ts` (the Next.js app whose UI this app is
 * adopting). Two deliberate differences from the source:
 *
 * 1. `content` scans only `src/dd/**` — the ported tree. The pre-existing pages
 *    under `src/pages` and `src/components` are styled entirely by the 15k-line
 *    `styles.css` and contain no Tailwind classes; scanning them would only pad
 *    the utility output.
 *
 * 2. `corePlugins.preflight` is OFF. Preflight is a *global* reset: it zeroes
 *    heading font-sizes and margins, strips list markers, and clears button
 *    backgrounds. `styles.css` leans on those browser defaults (it only resets
 *    `margin-top` on h1/h2/h3/p and never sets a heading font-size), so a global
 *    preflight visibly breaks every existing page. Instead the same reset is
 *    generated pre-scoped under `.dd-ui` into `src/dd/preflight.generated.css`
 *    by `scripts/build-scoped-preflight.mjs`. Re-run that script after changing
 *    `theme.fontFamily` or `theme.borderColor`, which preflight bakes in.
 */
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./src/dd/**/*.{ts,tsx,js,jsx}"],
  corePlugins: { preflight: false },
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        bg: "#f4f1ea",
        surface: "rgba(255,255,255,0.78)",
        "surface-border": "rgba(79,70,129,0.12)",
        muted: "rgba(23,19,41,0.62)",
        brand: "#06b6d4",
        good: "#10b981",
        warn: "#f59e0b",
        bad: "#ef4444",
        // Marketing palette — neon violet + cyan on deep navy.
        navy: "#0a0814",
        ink: "#0d0b1f",
        violet: "#a855f7",
        cyan: "#06b6d4",
      },
      fontFamily: {
        // The source app loaded these through `next/font/google`, which injected
        // `--font-*` vars on <body>. Vite has no equivalent, so the same three
        // vars are declared in `dd/globals.css` against a Google Fonts @import.
        // Sarabun stays last in both stacks as the per-glyph Thai fallback.
        serif: ["var(--font-instrument-serif)", "var(--font-sarabun)", "serif"],
        sans: ["var(--font-barlow)", "var(--font-sarabun)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 400ms ease-out",
      },
    },
  },
  plugins: [animate],
};
