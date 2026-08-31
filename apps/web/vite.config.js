import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const src = (p) => fileURLToPath(new URL(p, import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  envDir: '../..',
  plugins: [react()],
  resolve: {
    alias: {
      // The UI ported from the Next.js `doodee` app keeps its original
      // `@/components/...` and `@/lib/...` import specifiers. Pointing `@` at
      // the ported tree means those thousands of imports needed no rewriting,
      // and it cannot collide with the pre-existing code, which uses relative
      // imports throughout and has no `@` alias of its own.
      '@': src('./src/dd'),

      // Next.js framework modules, resolved to local shims. Aliasing rather
      // than rewriting the ~80 call sites keeps the ported files byte-similar
      // to upstream, so a future `git diff` against the source app still reads
      // as a diff instead of noise. See each shim for what it does and does not
      // reproduce.
      'next/link': src('./src/dd/shims/next-link.tsx'),
      'next/image': src('./src/dd/shims/next-image.tsx'),
      'next/navigation': src('./src/dd/shims/next-navigation.ts'),
      'next/dynamic': src('./src/dd/shims/next-dynamic.tsx'),
      'server-only': src('./src/dd/shims/server-only.ts'),

      // Auth runs on Firebase here; only `import type` lines survived the port.
      // See src/dd/shims/supabase-types.ts.
      '@supabase/supabase-js': src('./src/dd/shims/supabase-types.ts'),
    },
  },
  define: {
    // The ported tree checks `process.env.NODE_ENV` in eight places (dev-only
    // logging in ErrorBoundary, fixture shortcuts in the preview code). Vite
    // exposes the mode as `import.meta.env.MODE` instead, and leaves
    // `process` undefined in the browser, so the eight reads would throw.
    // Defining it keeps those files identical to upstream. The four
    // `NEXT_PUBLIC_*` vars they also used were renamed to `VITE_*` at the call
    // sites instead, since those names have to match this repo's shared .env.
    // Taken from Vite's own `mode` rather than the ambient NODE_ENV, which is
    // not reliably set when the CLI is invoked.
    'process.env.NODE_ENV': JSON.stringify(
      mode === 'development' ? 'development' : 'production',
    ),
  },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        // 156 of the ported files open with `"use client"`. The directive is
        // meaningless outside Next, but Rollup cannot hoist it out of a module
        // it is inlining and warns once per file, burying real warnings under
        // 156 lines of noise. Dropping the directive from every file would be a
        // large, purely cosmetic diff against upstream, so the warning is
        // filtered instead.
        if (
          warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
          warning.message.includes('use client')
        ) {
          return
        }
        warn(warning)
      },
    },
  },
}))
