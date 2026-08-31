/**
 * `server-only` is a Next.js tripwire package: importing it from a module that
 * ends up in a client bundle is a build error. Nothing server-renders here, and
 * the modules that import it are only ported for their types and pure helpers,
 * so the tripwire is replaced with an empty module.
 *
 * This does mean the guard is gone. Server-side secrets must not be reached for
 * from this app at all — the Django backend holds them.
 */
export {};
