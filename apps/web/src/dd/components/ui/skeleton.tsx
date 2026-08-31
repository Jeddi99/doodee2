"use client";

import { cn } from "@/lib/utils/cn";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shimmer?: boolean;
}

export function Skeleton({
  shimmer = true,
  className,
  ...rest
}: SkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn(
        "relative overflow-hidden rounded-lg bg-[#f8fafc]/[0.08]",
        shimmer &&
          "after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_2s_infinite] after:bg-gradient-to-r after:from-transparent after:via-white/[0.16] after:to-transparent",
        className
      )}
      {...rest}
    />
  );
}

export function SkeletonCircle({
  size = 40,
  className,
  ...rest
}: { size?: number } & SkeletonProps): React.JSX.Element {
  return (
    <Skeleton
      className={cn("rounded-full", className)}
      style={{ width: size, height: size }}
      {...rest}
    />
  );
}

export function SkeletonText({
  lines = 1,
  className,
  ...rest
}: { lines?: number } & SkeletonProps): React.JSX.Element {
  return (
    <div className={cn("space-y-2", className)} {...rest}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-3.5 rounded",
            i === lines - 1 && lines > 1 ? "w-3/5" : "w-full"
          )}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({
  className,
  children,
  ...rest
}: SkeletonProps & { children?: React.ReactNode }): React.JSX.Element {
  return (
    <div
      className={cn(
        "surface-glass relative overflow-hidden rounded-2xl p-5",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_2s_infinite] after:bg-gradient-to-r after:from-transparent after:via-white/[0.14] after:to-transparent",
        className
      )}
      role="status"
      aria-busy="true"
      {...rest}
    >
      {children}
    </div>
  );
}
