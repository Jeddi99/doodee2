"use client";

/**
 * Phase 158 — Tiny tabular UI primitive for admin lists.
 *
 * Not a full data-table — just a styled wrapper with pagination
 * buttons. Each admin list page passes its own row renderer.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
// Phase 192f — i18n for the admin DataTable pagination strip.
import { useT } from "@/lib/i18n";

export interface DataTableProps<T> {
  rows: T[];
  loading: boolean;
  error: string | null;
  empty: string;
  columns: Array<{ key: string; label: string; className?: string }>;
  renderRow: (row: T, idx: number) => React.ReactNode;
  renderMobileCard?: (row: T, idx: number) => React.ReactNode;
  page: number;
  hasMore: boolean;
  onPageChange: (next: number) => void;
  minWidthClassName?: string;
}

export function DataTable<T>({
  rows,
  loading,
  error,
  empty,
  columns,
  renderRow,
  renderMobileCard,
  page,
  hasMore,
  onPageChange,
  minWidthClassName,
}: DataTableProps<T>) {
  // Phase 192f — i18n labels for prev/next + page indicator.
  const { t } = useT();
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b1020] shadow-[0_14px_36px_-30px_rgba(0,0,0,0.7)]">
      {renderMobileCard && (
        <div className="space-y-2.5 p-2.5 sm:hidden">
          {loading &&
            Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`mobile-skeleton-${index}`}
                className="h-32 animate-pulse rounded-2xl border border-white/[0.08] bg-white/[0.04]"
                aria-hidden="true"
              />
            ))}
          {!loading && error && (
            <div className="px-4 py-12 text-center text-sm font-medium text-warn">
              {error}
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-white/48">
              {empty}
            </div>
          )}
          {!loading && !error && rows.map((row, index) => (
            <div key={index}>{renderMobileCard(row, index)}</div>
          ))}
        </div>
      )}
      <div className={`overflow-x-auto ${renderMobileCard ? "hidden sm:block" : ""}`}>
        {/* Phase 192v — `w-full` alone clamps the table to the container
            width, so on a narrow (mobile) viewport the 5-6 columns get
            crushed/wrapped and the `overflow-x-auto` parent never actually
            scrolls. Give the table a min-width so columns keep a legible
            size and the wrapper scrolls horizontally instead. */}
        <table className={`w-full text-left text-sm ${minWidthClassName ?? "min-w-[720px]"}`}>
          <thead>
            <tr className="border-b border-[#241f1a]/10 bg-white/40">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`whitespace-nowrap px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#665d54] ${
                    c.className ?? ""
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading &&
              // Phase 169 — show 5 ghost rows that match the eventual column
              // count so the table doesn't collapse from a single spinner
              // line to a tall list once the data lands.
              Array.from({ length: 5 }).map((_, rowIdx) => (
                <tr
                  key={`skel-${rowIdx}`}
                  className="border-b border-[#241f1a]/10"
                  aria-busy="true"
                  role="status"
                >
                  {columns.map((c, colIdx) => (
                    <td key={c.key} className="px-4 py-2.5">
                      <div
                        className={`h-3.5 animate-pulse rounded bg-[#ede8df] ${
                          colIdx === 0
                            ? "w-3/5"
                            : colIdx === columns.length - 1
                              ? "ml-auto w-1/3"
                              : "w-2/3"
                        }`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && error && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm font-medium text-[#b45309]"
                >
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-[#8a8178]"
                >
                  {empty}
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              rows.map((row, i) => renderRow(row, i))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] bg-white/[0.025] px-3 py-2.5 sm:px-4 sm:py-3">
        <span className="text-[11px] text-white/45">
          {t.dataTable.page.replace("{n}", String(page + 1))}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(0, page - 1))}
            disabled={page === 0 || loading}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/72 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/50"
          >
            <ChevronLeft className="h-3 w-3" />
            {t.dataTable.previous}
          </button>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={!hasMore || loading}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/72 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/50"
          >
            {t.dataTable.next}
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function TableCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={`border-b border-[#241f1a]/10 px-4 py-3 align-top text-[12px] leading-relaxed text-[#3c342d] ${
        className ?? ""
      }`}
    >
      {children}
    </td>
  );
}

export function TierBadge({ tier }: { tier: string }) {
  const tone: Record<string, string> = {
    free: "border-[#241f1a]/10 bg-white/40 text-[#665d54]",
    plus: "border-[#7c8f88]/35 bg-[#edf4f1]/70 text-[#3f6259] backdrop-blur-md",
    pro: "border-[#b99a62]/40 bg-[#fbf4e6] text-[#6f5422]",
    // Legacy tier badges (kept so historic DB rows still render).
    starter: "border-[#7c8f88]/35 bg-[#edf4f1]/70 text-[#3f6259] backdrop-blur-md",
    premium: "border-[#b99a62]/40 bg-[#fbf4e6] text-[#6f5422]",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
        tone[tier] ?? tone.free
      }`}
    >
      {tier}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    active: "border-[#15803d]/25 bg-[#ecfdf3]/70 text-[#166534] backdrop-blur-md",
    trialing: "border-[#3f6259]/25 bg-[#edf4f1]/70 text-[#3f6259] backdrop-blur-md",
    past_due: "border-[#b45309]/30 bg-[#fff7ed]/75 text-[#92400e] backdrop-blur-md",
    canceled: "border-[#241f1a]/10 bg-white/40 text-[#796f66]",
    none: "border-[#241f1a]/10 bg-white/35 text-[#8a8178]",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
        tone[status] ?? tone.none
      }`}
    >
      {status}
    </span>
  );
}
