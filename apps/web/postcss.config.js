import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import scopeDdGlobals from "./postcss-scope-dd.mjs";

/**
 * Applies to every stylesheet Vite processes, including the pre-existing
 * `src/styles.css`. That is safe:
 *   - `scopeDdGlobals` no-ops on any file but `src/dd/globals.css`;
 *   - the Tailwind plugin only emits into files carrying `@tailwind`
 *     directives, which is just `src/dd/globals.css`;
 *   - autoprefixer adds vendor prefixes without changing which rules match.
 *
 * Order matters, and the scoping plugin must run AFTER Tailwind. Run before,
 * its rewritten `body:has(.dd-ui)` selectors sit inside globals.css's
 * `@layer base` blocks, and Tailwind silently drops base-layer rules whose
 * selector carries a `:has()` — which deleted the page-background rule outright
 * instead of scoping it. Running after means Tailwind sees the plain `body` it
 * expects, and the scoping is applied to its output. Tailwind's own utilities
 * are class selectors, so the pass leaves them alone.
 */
export default {
  plugins: [tailwindcss(), scopeDdGlobals(), autoprefixer()],
};
