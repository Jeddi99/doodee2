"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import { humanizeError } from "@/lib/humanizeError";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional override of the fallback UI. */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Phase 192o — Detect user-cancelled actions. AbortError comes from
// fetch(signal) on unmount/navigation. DOMException name === "AbortError"
// or message containing "abort" should not surface as a crash.
function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === "object") {
    const e = err as { name?: string; code?: number | string; message?: string };
    if (e.name === "AbortError") return true;
    if (e.code === 20 || e.code === "ABORT_ERR") return true;
    if (typeof e.message === "string" && /aborted|user canceled|user cancelled/i.test(e.message)) {
      return true;
    }
  }
  return false;
}

/**
 * Phase 47 / 192o — React error boundary. Catches render errors so a
 * single bad component doesn't crash the whole tree. Wraps the main
 * content area in `(app)/layout.tsx`. The header + footer stay rendered
 * so the user can navigate away even if the page body errored.
 *
 * Friendly fallback shows a humanized message (no raw stack frames) and
 * offers two exits: try again (in-place reset, falls back to reload if
 * the same error re-throws), or go back to /scan.
 *
 * - Logs to console ONLY in development. In production, error stacks
 *   could leak component names tied to scan-rendering paths, so we keep
 *   logging minimal (no info.componentStack, no error.stack).
 * - Never sends errors to a server — the stack trace could include user-
 *   photo bytes if the error came from a scan-rendering component.
 * - AbortError (user-cancelled fetches on navigation/unmount) is
 *   suppressed; it's not a real crash.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    if (isAbortError(error)) {
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isAbortError(error)) return;
    if (process.env.NODE_ENV !== "production" && typeof console !== "undefined") {
      // Dev only — never log stack or componentStack in prod (PII risk
      // from scan-rendering frames). Ops should wire a sanitized
      // tracker (e.g. Sentry beforeSend) before re-enabling in prod.
      console.error("[ErrorBoundary]", error.message, info.componentStack);
    }
  }

  reset = () => {
    // Try in-place recovery first. If the same error fires again on
    // re-render, getDerivedStateFromError will flip hasError back true
    // and the user can still hit Reload from the rendered fallback.
    this.setState({ hasError: false, error: null });
  };

  hardReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const isDev = process.env.NODE_ENV !== "production";
    // Humanize in prod (TH default — matches app shell). Dev gets the
    // raw message in the pre block below for debugging.
    const userFacing = humanizeError(this.state.error, "th");
    const rawForDev = this.state.error?.message ?? "Unknown error";

    return (
      <div
        role="alert"
        aria-live="assertive"
        className="mx-auto max-w-md py-16 px-4 text-center space-y-6"
      >
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-warn/40 bg-warn/[0.08]">
          <AlertTriangle className="h-7 w-7 text-warn" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold leading-tight text-[#241f1a]">
            Something went wrong
          </h1>
          <p className="text-sm leading-relaxed text-[#6f625a]">
            {userFacing}
          </p>
          <p className="text-xs leading-relaxed text-[#8d8378]">
            Your photos never leave your device, so reloading won&apos;t lose
            anything except the in-progress view.
          </p>
        </div>
        {isDev && (
          <pre className="overflow-x-auto rounded-lg border border-white/60 bg-white/45 px-3 py-2 text-left text-[11px] text-[#6f625a] backdrop-blur">
            {rawForDev}
          </pre>
        )}
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={this.reset}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#241f1a] px-4 py-2 text-sm font-medium text-white shadow-[0_16px_34px_-24px_rgba(36,31,26,0.55)] transition hover:bg-[#342d27]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
          <button
            type="button"
            onClick={this.hardReload}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/60 bg-white/45 px-4 py-2 text-sm text-[#241f1a] shadow-[0_10px_26px_-24px_rgba(36,31,26,0.34)] backdrop-blur-md transition hover:border-white/80 hover:bg-white/65"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reload page
          </button>
          <Link
            href="/scan"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/60 bg-white/45 px-4 py-2 text-sm text-[#241f1a] shadow-[0_10px_26px_-24px_rgba(36,31,26,0.34)] backdrop-blur-md transition hover:border-white/80 hover:bg-white/65"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to assessment
          </Link>
        </div>
      </div>
    );
  }
}
