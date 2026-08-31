"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

/**
 * Phase 192s — shared empty-state primitive (dark-luxury).
 *
 * The reusable surface for "there's nothing here yet" / "no results" /
 * post-error fallbacks across the app. Centered editorial composition:
 * a softly-glowing icon medallion, a serif-italic title for scale
 * contrast, a muted subtitle, and an optional CTA.
 *
 * This is the canonical empty-state — other surfaces (history, saved
 * looks, recommend panel, search results) can adopt it incrementally.
 * NOT refactoring existing ad-hoc empty states in this pass; just
 * shipping the primitive.
 *
 * Depth is built cheaply (no backdrop-filter): a faint white-alpha
 * surface ring + a violet radial bloom behind the icon. Serif italic
 * auto-normalizes for Thai via the globals `:lang(th) .font-serif.italic`
 * rule, so titles read correctly in both languages.
 */
export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  action?: EmptyStateAction;
}

export function EmptyState({
  icon: Icon,
  title,
  subtitle,
  action,
  className,
  ...rest
}: EmptyStateProps): React.JSX.Element {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-sm flex-col items-center px-6 py-12 text-center",
        className
      )}
      {...rest}
    >
      {Icon ? (
        <div className="relative mb-6 flex h-16 w-16 items-center justify-center">
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-violet/15 blur-[8px]"
          />
          <span className="relative flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
            <Icon className="h-7 w-7 text-violet/80" strokeWidth={1.5} />
          </span>
        </div>
      ) : null}
      <h3 className="font-serif italic font-light text-2xl leading-tight text-white">
        {title}
      </h3>
      {subtitle ? (
        <p className="mt-2.5 text-sm leading-relaxed text-muted">{subtitle}</p>
      ) : null}
      {action ? (
        <Button
          asChild={Boolean(action.href)}
          size="sm"
          className="mt-6"
          onClick={action.onClick}
        >
          {action.href ? <a href={action.href}>{action.label}</a> : action.label}
        </Button>
      ) : null}
    </div>
  );
}
