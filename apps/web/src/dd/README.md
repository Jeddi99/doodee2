# `src/dd` — the UI ported from the Next.js `doodee` app

This directory is the UI of the standalone Next.js app at `../../../../doodee`,
running inside this Vite SPA. It is kept as close to upstream as possible: the
components, `lib/`, `locales/`, `data/` and `globals.css` are copies, still
importing `@/...` and `next/...`, so a future re-sync is a copy rather than a
merge. Everything this app needs to change lives in the seams described below.

The tree is mounted at **`/ui`**, not `/`. It is not a replacement for the
existing pages yet — see [Not wired yet](#not-wired-yet).

```
src/dd/
  DoodeeUI.tsx        root; stands in for the Next `app/layout.tsx`
  AppShell.tsx        stands in for `app/(app)/layout.tsx`
  routes.tsx          route table; one entry per upstream `page.tsx`
  globals.css         VERBATIM copy — do not edit, see "Styling"
  theme.css           fonts + `.dd-ui` rules this app adds
  preflight.generated.css   generated, see "Styling"
  shims/              the Next.js APIs, reimplemented
  lib/, components/, locales/, data/, types/    ported, near-verbatim
```

## Module aliases

Set in `vite.config.js`, mirrored in `tsconfig.json` so the editor agrees.
Aliasing rather than rewriting call sites kept ~80 imports untouched.

| Specifier | Resolves to | Notes |
|---|---|---|
| `@/*` | `src/dd/*` | upstream's own alias |
| `next/link` | `shims/next-link.tsx` | maps `href` → react-router `to` |
| `next/image` | `shims/next-image.tsx` | plain `<img>`; reproduces `fill` |
| `next/navigation` | `shims/next-navigation.ts` | `useRouter`, `usePathname`, … |
| `next/dynamic` | `shims/next-dynamic.tsx` | `React.lazy` + `Suspense` |
| `server-only` | `shims/server-only.ts` | empty module |
| `@supabase/supabase-js` | `shims/supabase-types.ts` | types only; SDK is not a dependency |

Only the surface the ported tree actually uses is shimmed. An unshimmed import
fails the build, which is the intended outcome.

## The mount prefix

`shims/base-path.ts` owns `DD_BASE = "/ui"` and translates both directions:
outbound (`Link`, `router.push/replace`) gets the prefix added, inbound
(`usePathname`) gets it stripped.

Stripping on the way in matters. Ported code compares the result against
upstream's own literals (`pathname === "/scan"`, the `next=` round-trip through
login), so it has to keep seeing upstream paths.

This was a real bug, not a precaution: without it, `AuthGate` sent anonymous
visitors to `/login`, which is the **pre-existing** app's login page, and every
signed-in ported route silently rendered the old UI instead.

`src/App.jsx` imports `DD_BASE` rather than redeclaring it — the two drifting
apart reintroduces exactly that failure.

**To retire the prefix**, set `DD_BASE = ""`; both functions become identities.

## Styling

Two design systems share one document. The pre-existing pages are styled by
`src/styles.css` (15k lines); this tree is Tailwind.

- **Preflight is OFF globally** (`corePlugins.preflight: false`). It is a global
  reset that zeroes heading sizes and margins, strips list markers and clears
  native button chrome — and `styles.css` leans on exactly those browser
  defaults. `scripts/build-scoped-preflight.mjs` re-emits the same reset
  pre-scoped under `.dd-ui` into `preflight.generated.css`. It is **generated**,
  because Preflight bakes `theme()` lookups into its output and a hand-copy
  would drift. Re-run after changing `theme.fontFamily`/`borderColor`:
  `npm run build:preflight`.

- **`globals.css` is a verbatim copy** and must stay that way. Upstream it owned
  the whole document — it paints the page background on `body`. `postcss-scope-dd.mjs`
  rewrites those rules to `body:has(.dd-ui)` during the build.
  That plugin **must run after Tailwind**: run before, its `:has()` selectors sit
  inside `@layer base`, and Tailwind silently drops base-layer rules containing
  `:has()`, which deleted the background rule outright instead of scoping it.

- **`.dd-ui` is load-bearing.** Both mechanisms key off it. Nothing from this
  tree should render outside it.

- Fonts come from Google Fonts in `theme.css`; upstream used `next/font`, which
  injected the `--font-*` variables `tailwind.config.js` refers to.

## Auth

`lib/supabase/auth-client.ts` keeps its upstream path and its entire exported
surface, but is **Firebase-backed** — the ID token the Django backend already
verifies. Firebase users are mapped to the Supabase-shaped objects the ported
components read (`id`, `email`, `user_metadata`). This is the one file to read
to understand how a ported screen gets a session.

Not reproduced: Google *ID-token* sign-in with a nonce (Firebase runs the whole
Google exchange in its own popup), and `scope: "global"` sign-out (no
client-side "revoke everywhere" exists on Firebase).

## Assets

`public/models`, `public/upgrade-assets`, `public/videos`, `public/validation`
were copied from upstream — only the files actually referenced, not the 129 MB
tree.

`public/wasm` is **derived, gitignored, and rebuilt on `predev`/`prebuild`** by
`scripts/sync-mediapipe-wasm.mjs`, which copies it out of the installed
`@mediapipe/tasks-vision`. The runtime must match the JS wrapper that loads it;
the pre-existing `public/mediapipe/` is a checked-in copy from an older release
that no longer matches the pinned 0.10.35 package. Deriving from node_modules
means that drift cannot recur here.

> A missing model does not fail loudly. The dev server answers an unknown path
> with `index.html`, and MediaPipe reports the HTML as
> `"The model is not a valid Flatbuffer buffer"`.

## Not wired yet

The ported screens call the Next app's own `/api/*` routes. `lib/api-bridge.ts`
sorts each into mapped / no-op / not-wired; `ddFetch` replaces `fetch` at those
call sites.

Analytics (`/api/product-events`, `/api/usage/track`) resolve `204` — dropping
them costs nothing visible. Everything below resolves a well-formed `501` so the
screen shows its own error state rather than throwing on an HTML response:

| Endpoint | Why it is not mapped |
|---|---|
| `/api/quota`, `/api/quota/consume`, `/api/quota/refund` | client counts `scans_quota`/`scans_used`; Django meters plan tiers with per-month entitlements (previews, saves, chat turns) and has **no scan counter** |
| `/api/user-profile` | Django `/profile/` is read-only; onboarding preferences have no write endpoint |
| `/api/redeem` | Django `/redeem/` exists but takes a different request/response shape |
| `/api/stripe/checkout`, `/api/stripe/portal` | billing is Omise here; checkout goes through `/orders/` |
| `/api/dataset/consent-sample` | dataset-consent capture was not ported |

These are **deliberately not faked**. Synthesising a `SubscriptionRow` would put
invented allowances in front of users and mis-gate paid features. Mapping the
quota model is a product decision and belongs in the commit that makes it.

A screen becomes canonical (moves off `/ui`) once its data layer is connected.

## Verifying

```sh
npm run build          # also runs sync:wasm
npm test               # the pre-existing suite; must stay green
npm run dev            # then, in another shell:
npm run smoke -- http://localhost:5173 --auth / /home /ui /ui/scan /ui/settings
```

`scripts/smoke-routes.mjs` loads each route in headless Chrome and asserts it
rendered, logged no unexpected error, and mounted the *correct* UI — `.dd-ui`
present on a `/ui` route and absent elsewhere. That last check is the one that
matters: a `/ui` route quietly rendering the pre-existing app still looks fine
in a screenshot. A build cannot catch any of this.
