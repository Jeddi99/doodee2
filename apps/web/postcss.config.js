/**
 * Applies to every stylesheet Vite processes, including the pre-existing
 * `src/styles.css`. That is safe: the Tailwind plugin only emits into files that
 * actually carry `@tailwind` directives (just `src/dd/globals.css`), and
 * autoprefixer adds vendor prefixes without changing which rules match.
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
