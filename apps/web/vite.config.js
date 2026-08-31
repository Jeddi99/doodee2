import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const src = (p) => fileURLToPath(new URL(p, import.meta.url))

// https://vite.dev/config/
export default defineConfig({
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
    },
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
})
