/**
 * Stands in for `next/link` in the ported UI.
 *
 * Aliased in `vite.config.js`, so the 35 call sites keep importing
 * `from "next/link"` and never learn they are on react-router. Rewriting them
 * would have touched a third of the ported files for no behavioural gain, and
 * every one of those edits is a chance to fumble a className.
 */
import { forwardRef } from "react";
import { Link as RouterLink } from "react-router-dom";
import { toAppPath } from "./base-path";
import type { AnchorHTMLAttributes, ReactNode, Ref } from "react";

type NextLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children?: ReactNode;
  /** Router-level hints with no react-router equivalent; accepted and dropped. */
  prefetch?: boolean | null;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
  locale?: string | false;
};

/**
 * react-router's <Link> only understands in-app paths — handing it an absolute
 * URL makes it push a history entry for a path that does not exist rather than
 * leaving the site. Anything that is not app-relative therefore falls through
 * to a plain anchor, which also covers `mailto:`, `tel:` and bare `#hash`.
 */
function isInAppPath(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

export const Link = forwardRef(function Link(
  {
    href,
    children,
    prefetch: _prefetch,
    replace,
    scroll,
    shallow: _shallow,
    passHref: _passHref,
    legacyBehavior: _legacyBehavior,
    locale: _locale,
    ...rest
  }: NextLinkProps,
  ref: Ref<HTMLAnchorElement>,
) {
  if (!isInAppPath(href)) {
    return (
      <a ref={ref} href={href} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <RouterLink
      ref={ref}
      // The ported tree writes upstream's absolute paths; this maps them onto
      // the prefix the UI is actually mounted at. See ./base-path.
      to={toAppPath(href)}
      replace={replace}
      // Next scrolls to top on navigation unless told otherwise; react-router
      // does not scroll at all unless asked. `preventScrollReset` is the
      // inverse switch, so the default (`scroll` undefined → true) must map to
      // `false` here to reproduce Next's behaviour.
      preventScrollReset={scroll === false}
      {...rest}
    >
      {children}
    </RouterLink>
  );
});

export default Link;
