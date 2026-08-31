/**
 * PostCSS plugin that makes the ported `src/dd/globals.css` safe to load
 * alongside the pre-existing `src/styles.css`.
 *
 * `globals.css` is a verbatim copy of the Next.js app's stylesheet, where it
 * owned the whole document: it paints the page background on `body`, sets
 * `overflow-x` on `html, body`, and so on. Here it owns only the ported
 * subtree, and those document-level rules would repaint every pre-existing page
 * in the dark navy theme.
 *
 * Rather than editing 6,478 lines — which would make every future re-sync from
 * upstream a merge conflict — the two problem shapes are rewritten on the way
 * through the build:
 *
 *   `body`        → `body:has(.dd-ui)`      (paint only when a ported page is up)
 *   `html, body`  → `html:has(.dd-ui), body:has(.dd-ui)`
 *
 * The file's own `@tailwind base` is left in place. It looks like it should be
 * stripped — the reset ships separately, pre-scoped, as
 * `preflight.generated.css` — but `corePlugins.preflight` is already off in
 * tailwind.config.js, so the directive expands to nothing but the `--tw-*`
 * custom-property defaults, which are inert until a utility reads them.
 * Removing it instead orphans the file's `@layer base` blocks and Tailwind
 * refuses to build.
 *
 * Left alone deliberately:
 *   - `html.light …`, `body:has(.qoves-landing)` and friends. They are already
 *     specific to classes that exist only inside the ported tree.
 *   - The bare `*` rules inside `@media (prefers-reduced-motion)` and
 *     `@media print`. Those are accessibility and print concessions that
 *     *should* apply to the whole document.
 *   - `:root` custom-property declarations. Variables are inert until something
 *     reads them, and the ported components need them defined at the root.
 */

const SCOPE = ".dd-ui";

// Only the bare document-root selectors. Anything with a class, attribute or
// pseudo attached is already scoped by construction and is left untouched.
const BARE_ROOT = /^(html|body)$/;

function scope(selector) {
  const trimmed = selector.trim();
  return BARE_ROOT.test(trimmed) ? `${trimmed}:has(${SCOPE})` : trimmed;
}

/** @type {import('postcss').PluginCreator<{ match?: RegExp }>} */
export default function scopeDdGlobals(options = {}) {
  const match = options.match ?? /src[/\\]dd[/\\]globals\.css$/;
  return {
    postcssPlugin: "postcss-scope-dd-globals",
    Once(root) {
      const file = root.source?.input?.file ?? "";
      if (!match.test(file)) return;

      root.walkRules((rule) => {
        if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
        const scoped = rule.selectors.map(scope);
        // Only touch the rule if something actually changed, so the emitted CSS
        // stays as close to the source as possible.
        if (scoped.some((s, i) => s !== rule.selectors[i].trim())) rule.selectors = scoped;
      });
    },
  };
}

scopeDdGlobals.postcss = true;
