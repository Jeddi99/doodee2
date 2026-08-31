/**
 * The mount point of the ported UI, and the translation between the paths the
 * ported code writes and the paths the router actually serves.
 *
 * Upstream the ported tree WAS the whole site, so it navigates with absolute
 * paths: `<Link href="/login">`, `router.replace("/login?next=…")`,
 * `usePathname() === "/scan"`. Here it is mounted under a prefix while its
 * screens are wired to Django one at a time. Without a translation those
 * absolute paths escape the prefix — `AuthGate` sending an anonymous visitor to
 * `/login` landed them on the *pre-existing* app's login page, which is how
 * every signed-in ported route silently rendered the old UI instead.
 *
 * Both directions matter:
 *   toAppPath   `/login`    -> `/ui/login`   (outbound: Link, push, replace)
 *   fromAppPath `/ui/scan`  -> `/scan`       (inbound: usePathname)
 *
 * `usePathname` must strip the prefix, not expose it, because ported code
 * compares the result against its own literals (`pathname === "/scan"`,
 * nav-active checks, the `next=` round-trip through login). Those comparisons
 * are written in upstream's terms and must keep seeing upstream's paths.
 *
 * Retiring the prefix later is a one-line change here: set DD_BASE to "" and
 * both functions become identities.
 */

/** Mount point. Kept in sync with DD_PREFIX in src/App.jsx, which imports it. */
export const DD_BASE = "/ui";

/** In-app absolute path -> the path the router serves. Preserves query + hash. */
export function toAppPath(href: string): string {
  if (!DD_BASE) return href;
  // Only in-app absolute paths are rewritten. External URLs, protocol-relative
  // URLs, `mailto:`, and bare `#hash` links must pass through untouched.
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  if (href === DD_BASE || href.startsWith(`${DD_BASE}/`)) return href;
  return `${DD_BASE}${href}`;
}

/** Router path -> the in-app absolute path the ported code expects to see. */
export function fromAppPath(pathname: string): string {
  if (!DD_BASE) return pathname;
  if (pathname === DD_BASE) return "/";
  if (pathname.startsWith(`${DD_BASE}/`)) return pathname.slice(DD_BASE.length);
  return pathname;
}
