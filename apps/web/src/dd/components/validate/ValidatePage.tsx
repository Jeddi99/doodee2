"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Loader2,
  RotateCcw,
  X,
  AlertCircle,
} from "lucide-react";
import { FaceMeshDetector } from "@/lib/mediapipe";
import {
  computeAll,
  foldSecondOpinion,
  tierFor,
  type ScanResult,
} from "@/lib/scoring";
import type { Ethnicity, Gender } from "@/types";

/**
 * Phase 1 — Validation runner UI.
 *
 * Pure client-side: loads labels.json + each labeled image, runs the
 * scoring pipeline, displays a table. Re-run button at the top.
 */

interface ValidationCase {
  id: string;
  filename: string;
  gender: Gender;
  ethnicity: Ethnicity;
  expected_overall_min: number;
  expected_overall_max: number;
  notes?: string;
}

interface Labels {
  version: number;
  notes?: string;
  cases: ValidationCase[];
}

type CaseStatus =
  | { kind: "pending" }
  | { kind: "running" }
  | { kind: "ok"; result: ScanResult; pass: boolean }
  | { kind: "noFace" }
  | { kind: "error"; message: string };

interface RowState {
  case: ValidationCase;
  status: CaseStatus;
}

function inRange(v: number, lo: number, hi: number): boolean {
  return v >= lo && v <= hi;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

export function ValidatePage() {
  const [labels, setLabels] = useState<Labels | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [running, setRunning] = useState(false);
  const detectorRef = useRef<FaceMeshDetector | null>(null);

  // Load labels.json once on mount.
  useEffect(() => {
    let cancelled = false;
    fetch("/validation/labels.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`labels.json ${r.status}`);
        return r.json() as Promise<Labels>;
      })
      .then((data) => {
        if (cancelled) return;
        setLabels(data);
        // Skip the example entry that ships with empty filename
        const real = data.cases.filter((c) => c.filename && c.id);
        setRows(real.map((c) => ({ case: c, status: { kind: "pending" } })));
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadErr(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function runAll() {
    if (running || rows.length === 0) return;
    setRunning(true);
    // Reset all to pending
    setRows((prev) =>
      prev.map((r) => ({ ...r, status: { kind: "pending" } }))
    );
    try {
      if (!detectorRef.current) {
        detectorRef.current = await FaceMeshDetector.load();
      }
      const detector = detectorRef.current;
      for (let i = 0; i < rows.length; i += 1) {
        const r = rows[i]!;
        setRows((prev) => {
          const next = [...prev];
          next[i] = { ...next[i]!, status: { kind: "running" } };
          return next;
        });
        try {
          const img = await loadImage(`/validation/${r.case.filename}`);
          const detected = detector.detect(img);
          if (!detected) {
            setRows((prev) => {
              const next = [...prev];
              next[i] = { ...next[i]!, status: { kind: "noFace" } };
              return next;
            });
            continue;
          }
          const result = computeAll(
            { front: detected.landmarks },
            { gender: r.case.gender, ethnicity: r.case.ethnicity }
          );
          const blended = foldSecondOpinion(result);
          const pass = inRange(
            blended.overall,
            r.case.expected_overall_min,
            r.case.expected_overall_max
          );
          setRows((prev) => {
            const next = [...prev];
            next[i] = {
              ...next[i]!,
              status: { kind: "ok", result: blended, pass },
            };
            return next;
          });
        } catch (e) {
          setRows((prev) => {
            const next = [...prev];
            next[i] = {
              ...next[i]!,
              status: {
                kind: "error",
                message: e instanceof Error ? e.message : String(e),
              },
            };
            return next;
          });
        }
      }
    } finally {
      setRunning(false);
    }
  }

  const summary = useMemo(() => {
    let pass = 0;
    let fail = 0;
    let noFace = 0;
    let errored = 0;
    for (const r of rows) {
      if (r.status.kind === "ok") (r.status.pass ? pass++ : fail++);
      else if (r.status.kind === "noFace") noFace++;
      else if (r.status.kind === "error") errored++;
    }
    return { pass, fail, noFace, errored, total: rows.length };
  }, [rows]);

  return (
    <article className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/55 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[#3f6268] backdrop-blur-md">
          Phase 1 · validation
        </p>
        <h1 className="font-serif text-3xl font-light italic text-[#241f1a] md:text-4xl">
          Validation runner
        </h1>
        <p className="max-w-2xl text-sm text-[#5f574f]">
          Loads <code className="text-[#3f6268]">public/validation/labels.json</code>,
          runs the full scoring pipeline on each labeled image, reports pass/fail
          against the expected overall-score range. Hidden route — internal only.
        </p>
      </header>

      {loadErr && (
        <div className="flex items-start gap-2 rounded-2xl border border-warn/25 bg-white/65 p-5 text-sm text-warn shadow-[0_18px_46px_-38px_rgba(36,31,26,0.35)] backdrop-blur-md">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-none" />
          <div>
            <p>Couldn&apos;t load labels.json: {loadErr}</p>
            <p className="mt-1 text-xs text-[#6c6258]">
              Make sure <code>public/validation/labels.json</code> exists and is valid JSON.
            </p>
          </div>
        </div>
      )}

      {labels && rows.length === 0 && (
        <div className="space-y-2 rounded-2xl border border-[#241f1a]/10 bg-white/60 p-6 text-sm text-[#5f574f] shadow-[0_18px_46px_-38px_rgba(36,31,26,0.35)] backdrop-blur-md">
          <p className="font-medium text-[#241f1a]">No validation cases yet.</p>
          <p>
            Add image files to <code className="text-[#3f6268]">public/validation/</code>
            {" "}and entries to <code className="text-[#3f6268]">labels.json</code>:
          </p>
          <pre className="overflow-x-auto rounded-lg border border-[#241f1a]/10 bg-white/45 p-3 text-xs text-[#241f1a] backdrop-blur-md">
{`{
  "id": "my-test-1",
  "filename": "my-test-1.jpg",
  "gender": "male",
  "ethnicity": "asian",
  "expected_overall_min": 7.0,
  "expected_overall_max": 8.5,
  "notes": "Private licensed reference"
}`}
          </pre>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-good font-medium">
                ✓ {summary.pass} pass
              </span>
              <span className="text-warn font-medium">
                ✗ {summary.fail} fail
              </span>
              {summary.noFace > 0 && (
                <span className="text-[#6c6258]">
                  {summary.noFace} no face
                </span>
              )}
              {summary.errored > 0 && (
                <span className="text-bad">
                  {summary.errored} error
                </span>
              )}
              <span className="text-[#8a8178]">/ {summary.total} total</span>
            </div>
            <button
              type="button"
              onClick={runAll}
              disabled={running}
              className="inline-flex items-center gap-2 rounded-lg bg-[#241f1a] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#342d27] disabled:opacity-40"
            >
              {running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              {running ? "Running…" : "Run all"}
            </button>
          </div>

          <div className="space-y-2">
            {rows.map((r, i) => (
              <ValidationRow key={r.case.id} idx={i + 1} state={r} />
            ))}
          </div>
        </>
      )}
    </article>
  );
}

function ValidationRow({ idx, state }: { idx: number; state: RowState }) {
  const { case: c, status } = state;
  let toneClass = "border-[#241f1a]/10";
  let icon: React.ReactNode = null;
  if (status.kind === "ok") {
    toneClass = status.pass ? "border-good/40" : "border-warn/40";
    icon = status.pass ? (
      <Check className="h-4 w-4 text-good" />
    ) : (
      <X className="h-4 w-4 text-warn" />
    );
  } else if (status.kind === "noFace" || status.kind === "error") {
    toneClass = "border-bad/40";
    icon = <AlertCircle className="h-4 w-4 text-bad" />;
  } else if (status.kind === "running") {
    icon = <Loader2 className="h-4 w-4 animate-spin text-[#3f6268]" />;
  }
  return (
    <div className={`grid grid-cols-1 items-center gap-3 rounded-2xl border ${toneClass} bg-white/60 p-4 shadow-[0_18px_46px_-38px_rgba(36,31,26,0.35)] backdrop-blur-md md:grid-cols-[80px_120px_1fr_180px]`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- internal validation tool, no LCP concern */}
      <img
        src={`/validation/${c.filename}`}
        alt={c.id}
        className="mx-auto h-16 w-16 rounded-lg bg-white/45 object-cover md:mx-0"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
        }}
      />
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-[#241f1a]">{c.id}</p>
        <p className="text-[11px] text-[#6c6258]">
          #{idx} · {c.gender} · {c.ethnicity}
        </p>
      </div>
      <div className="space-y-0.5 text-xs text-[#5f574f]">
        {status.kind === "ok" && (
          <>
            <p>
              Predicted: <span className="font-medium tabular-nums text-[#241f1a]">{status.result.overall.toFixed(2)}</span>
              {" · "}
              {tierFor(status.result.overall, c.gender)}
            </p>
            <p className="text-[#6c6258]">
              Expected: {c.expected_overall_min.toFixed(1)} – {c.expected_overall_max.toFixed(1)}
            </p>
            {c.notes && <p className="text-[#8a8178] italic">{c.notes}</p>}
          </>
        )}
        {status.kind === "noFace" && (
          <p className="text-bad">AI didn&apos;t find a face in this image.</p>
        )}
        {status.kind === "error" && (
          <p className="text-bad">Error: {status.message}</p>
        )}
        {status.kind === "running" && (
          <p className="text-[#3f6268]">Detecting + scoring...</p>
        )}
        {status.kind === "pending" && (
          <p className="text-[#8a8178]">Waiting</p>
        )}
      </div>
      <div className="flex items-center justify-end">{icon}</div>
    </div>
  );
}
