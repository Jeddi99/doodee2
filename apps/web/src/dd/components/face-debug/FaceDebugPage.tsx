"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Loader2, Wrench } from "lucide-react";
import { PhotoUpload } from "@/components/scan/PhotoUpload";
import { FaceMeshDetector } from "@/lib/mediapipe";
import {
  computeAll,
  foldSkinIntoOverall,
  type ScanResult,
  estimatePose,
  type PoseEstimate,
} from "@/lib/scoring";
import { analyzeSkin } from "@/lib/skin/analyzeSkin";
import { useTrackedTimeout } from "@/lib/use-tracked-timeout";
import { LANDMARK } from "@/data/landmarks-ref";
import type { Landmarks, MetricKey } from "@/types";

type Phase =
  | { kind: "idle" }
  | { kind: "loadingModel" }
  | { kind: "processing" }
  | {
      kind: "ready";
      image: HTMLImageElement;
      landmarks: Landmarks;
      pose: PoseEstimate;
      result: ScanResult;
    }
  | { kind: "error"; reason: string };

const LABELED_LANDMARKS: { key: keyof typeof LANDMARK; label: string }[] = [
  { key: "foreheadApex", label: "forehead" },
  { key: "noseTip", label: "nose tip" },
  { key: "subnasale", label: "subnasale" },
  { key: "chin", label: "chin" },
  { key: "leftOuterCanthus", label: "L outer" },
  { key: "leftInnerCanthus", label: "L inner" },
  { key: "rightInnerCanthus", label: "R inner" },
  { key: "rightOuterCanthus", label: "R outer" },
  { key: "leftCheek", label: "L cheek" },
  { key: "rightCheek", label: "R cheek" },
  { key: "leftGonion", label: "L gonion" },
  { key: "rightGonion", label: "R gonion" },
  { key: "leftBrowApex", label: "L brow" },
  { key: "rightBrowApex", label: "R brow" },
  { key: "leftAlar", label: "L alar" },
  { key: "rightAlar", label: "R alar" },
  { key: "leftMouthCorner", label: "L mouth" },
  { key: "rightMouthCorner", label: "R mouth" },
];

export function FaceDebugPage() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const detectorRef = useRef<FaceMeshDetector | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const lastImageRef = useRef<HTMLImageElement | null>(null);
  const [copied, setCopied] = useState(false);
  // Phase 192q — tracked timeout so the copied flag revert can't fire
  // on an unmounted debug page after the user navigates away.
  const scheduleTimeout = useTrackedTimeout();

  useEffect(() => {
    if (phase.kind === "ready") {
      lastImageRef.current = phase.image;
    }
  }, [phase]);

  useEffect(() => {
    return () => {
      if (lastImageRef.current && lastImageRef.current.src.startsWith("blob:")) {
        try { URL.revokeObjectURL(lastImageRef.current.src); } catch {}
      }
    };
  }, []);

  async function handlePhoto(image: HTMLImageElement) {
    try {
      if (!detectorRef.current) {
        setPhase({ kind: "loadingModel" });
        detectorRef.current = await FaceMeshDetector.load();
      }
      setPhase({ kind: "processing" });
      const detected = detectorRef.current.detect(image);
      if (!detected) {
        if (image.src.startsWith("blob:")) try { URL.revokeObjectURL(image.src); } catch {}
        setPhase({ kind: "error", reason: "No face detected" });
        return;
      }
      const { landmarks } = detected;
      const pose = estimatePose(landmarks);
      const raw = computeAll(
        { front: landmarks },
        { gender: "male", ethnicity: "universal" }
      );
      const skin = analyzeSkin(image, landmarks);
      const result = skin ? foldSkinIntoOverall(raw, skin) : raw;
      setPhase({ kind: "ready", image, landmarks, pose, result });
    } catch (err) {
      if (image.src.startsWith("blob:")) try { URL.revokeObjectURL(image.src); } catch {}
      const msg = err instanceof Error ? err.message : "Detection failed";
      setPhase({ kind: "error", reason: msg });
    }
  }

  useEffect(() => {
    if (phase.kind !== "ready") return;
    drawOverlay(
      overlayRef.current,
      phase.image,
      phase.landmarks,
      phase.pose
    );
  }, [phase]);

  function reset() {
    if (lastImageRef.current && lastImageRef.current.src.startsWith("blob:")) {
      try { URL.revokeObjectURL(lastImageRef.current.src); } catch {}
    }
    lastImageRef.current = null;
    setPhase({ kind: "idle" });
    setCopied(false);
  }

  async function handleCopyJson() {
    if (phase.kind !== "ready") return;
    const payload = {
      pose: phase.pose,
      overall: phase.result.overall,
      confidence: phase.result.confidence,
      categories: phase.result.categories,
      metrics: phase.result.metrics,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      scheduleTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be denied — ignore.
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-violet/30 bg-violet/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-violet/90">
          <Wrench className="h-3 w-3" />
          Internal · landmark inspector
        </div>
        <h1 className="font-serif italic font-light text-3xl md:text-4xl text-gradient-neon">
          Face debug
        </h1>
        <p className="text-sm text-white/55 max-w-2xl">
          Inspect AI face landmark output: 478-pt landmarks, head-pose
          estimate, raw + normalized metric values, sanity-flagged + low-
          confidence metrics. Use this to verify landmark indices and
          calibration. Not linked from the public UI.
        </p>
      </header>

      {phase.kind === "idle" && (
        <PhotoUpload onPhoto={handlePhoto} promptText="Drop a front-facing photo, or" />
      )}

      {(phase.kind === "loadingModel" || phase.kind === "processing") && (
        <div className="glass-card rounded-2xl p-12 text-center space-y-3">
          <Loader2 className="mx-auto h-7 w-7 text-violet animate-spin" />
          <p className="text-sm text-white/70">
            {phase.kind === "loadingModel"
              ? "Loading AI model…"
              : "Detecting landmarks…"}
          </p>
        </div>
      )}

      {phase.kind === "error" && (
        <div className="glass-card rounded-2xl p-6 text-center space-y-3">
          <p className="text-sm text-warn">{phase.reason}</p>
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-[44px] items-center rounded-lg px-4 py-2 text-sm text-violet transition-colors hover:text-violet/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/35"
          >
            Try another
          </button>
        </div>
      )}

      {phase.kind === "ready" && (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3">
            <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#0a0814]">
              <canvas ref={overlayRef} className="w-full h-auto block" />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopyJson}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-violet/15 border border-violet/30 px-4 py-2 text-xs text-violet hover:bg-violet/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/35"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? "Copied" : "Copy JSON"}
              </button>
              <button
                type="button"
                onClick={reset}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-white/70 hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/35"
              >
                New photo
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <PoseCard pose={phase.pose} />
            <OverallCard result={phase.result} />
            {phase.result.skin && <SkinCard skin={phase.result.skin} />}
            <FlaggedCard result={phase.result} />
            <MetricsTable result={phase.result} />
          </div>
        </div>
      )}
    </div>
  );
}

function SkinCard({ skin }: { skin: NonNullable<ScanResult["skin"]> }) {
  const [r, g, b] = skin.meanRgb;
  const avg = (skin.uniformity + skin.clarity + skin.glow) / 3;
  return (
    <div className="glass-card rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/45">
          Skin
        </h3>
        <div className="flex items-center gap-2 text-xs">
          <span
            aria-hidden
            className="inline-block h-4 w-4 rounded-full border border-white/15"
            style={{ background: `rgb(${r},${g},${b})` }}
          />
          <span className="tabular-nums font-medium">{avg.toFixed(1)}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
        <div className="rounded-lg border border-white/[0.07] py-1.5">
          <p className="text-white/45">uniform</p>
          <p className="tabular-nums text-white/85 mt-0.5">{skin.uniformity}</p>
        </div>
        <div className="rounded-lg border border-white/[0.07] py-1.5">
          <p className="text-white/45">clarity</p>
          <p className="tabular-nums text-white/85 mt-0.5">{skin.clarity}</p>
        </div>
        <div className="rounded-lg border border-white/[0.07] py-1.5">
          <p className="text-white/45">glow</p>
          <p className="tabular-nums text-white/85 mt-0.5">{skin.glow}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] text-white/45">
        <div>
          lum:{" "}
          <span className="tabular-nums text-white/70">{skin.luminance}</span>
        </div>
        <div>
          texture σ:{" "}
          <span className="tabular-nums text-white/70">
            {skin.textureSigma}
          </span>
        </div>
        <div>
          tone var:{" "}
          <span className="tabular-nums text-white/70">
            {skin.toneVariance}
          </span>
        </div>
        <div>
          RGB:{" "}
          <span className="tabular-nums text-white/70">
            {r}, {g}, {b}
          </span>
        </div>
      </div>
    </div>
  );
}

function PoseCard({ pose }: { pose: PoseEstimate }) {
  const frontPct = Math.round(pose.frontness * 100);
  const tone =
    pose.frontness >= 0.75
      ? "text-good"
      : pose.frontness >= 0.45
        ? "text-warn"
        : "text-bad";
  return (
    <div className="glass-card rounded-2xl p-4 space-y-3">
      <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/45">
        Head pose
      </h3>
      <div className="grid grid-cols-3 gap-2 text-center">
        <PoseStat label="yaw" value={`${pose.yaw.toFixed(1)}°`} />
        <PoseStat label="pitch" value={`${pose.pitch.toFixed(1)}°`} />
        <PoseStat label="roll" value={`${pose.roll.toFixed(1)}°`} />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/55">frontness</span>
        <span className={`font-medium tabular-nums ${tone}`}>{frontPct}%</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] text-white/45">
        <div>
          IPD: <span className="tabular-nums text-white/70">{pose.interPupil.toFixed(3)}</span>
        </div>
        <div>
          face W: <span className="tabular-nums text-white/70">{pose.faceWidth.toFixed(3)}</span>
        </div>
        <div>
          face H: <span className="tabular-nums text-white/70">{pose.faceHeight.toFixed(3)}</span>
        </div>
      </div>
    </div>
  );
}

function PoseStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] py-2">
      <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">
        {label}
      </p>
      <p className="text-sm tabular-nums text-white/90 mt-0.5">{value}</p>
    </div>
  );
}

function OverallCard({ result }: { result: ScanResult }) {
  const confidencePct = Math.round(result.confidence * 100);
  return (
    <div className="glass-card rounded-2xl p-4 space-y-2">
      <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/45">
        Overall
      </h3>
      <div className="flex items-baseline gap-3">
        <span className="font-serif italic font-light text-4xl text-gradient-neon tabular-nums">
          {result.overall.toFixed(2)}
        </span>
        <span className="text-xs text-white/45">/ 10</span>
        <span className="text-[11px] text-white/55 ml-auto">
          confidence{" "}
          <span className="tabular-nums text-white/85">{confidencePct}%</span>
        </span>
      </div>
      <div className="pt-1 grid grid-cols-2 gap-1 text-[11px]">
        {Object.entries(result.categories).map(([cat, val]) => (
          <div key={cat} className="flex justify-between">
            <span className="text-white/55">{cat}</span>
            <span className="tabular-nums text-white/85">
              {val?.toFixed(2) ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FlaggedCard({ result }: { result: ScanResult }) {
  const flagged = (Object.entries(result.metrics) as [MetricKey, NonNullable<ScanResult["metrics"][MetricKey]>][])
    .filter(([, r]) => r?.flagged)
    .map(([k]) => k);
  if (flagged.length === 0) return null;
  return (
    <div className="rounded-2xl border border-warn/30 bg-warn/[0.05] p-3 space-y-1">
      <p className="text-[11px] uppercase tracking-[0.2em] text-warn">
        Flagged ({flagged.length})
      </p>
      <p className="text-[11px] text-white/65 break-words leading-relaxed">
        {flagged.join(" · ")}
      </p>
    </div>
  );
}

function MetricsTable({ result }: { result: ScanResult }) {
  const rows = (Object.entries(result.metrics) as [MetricKey, NonNullable<ScanResult["metrics"][MetricKey]>][])
    .filter(([, r]) => !r?.flagged)
    .sort(([, a], [, b]) => (a?.score ?? 0) - (b?.score ?? 0));
  return (
    <div className="glass-card rounded-2xl p-3 max-h-[420px] overflow-y-auto">
      <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/45 mb-2 px-1 sticky top-0 bg-[#0a0814]/95 py-1">
        Per-metric (sorted by score)
      </h3>
      <div className="overflow-x-auto">
      <table className="min-w-[520px] w-full text-[11px]">
        <thead>
          <tr className="text-white/40 text-left">
            <th className="font-normal pb-1 pl-1">metric</th>
            <th className="font-normal pb-1 text-right">raw</th>
            <th className="font-normal pb-1 text-right">score</th>
            <th className="font-normal pb-1 text-right pr-1">conf</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, r]) => {
            if (!r) return null;
            const conf = r.confidence ?? 1;
            const confTone =
              conf >= 0.75 ? "text-good" : conf >= 0.45 ? "text-warn" : "text-bad";
            return (
              <tr key={k} className="border-t border-white/[0.05]">
                <td className="py-1 pl-1 text-white/75">{k}</td>
                <td className="py-1 text-right tabular-nums text-white/55">
                  {r.raw.toFixed(2)}
                </td>
                <td className="py-1 text-right tabular-nums text-white/85">
                  {r.score.toFixed(2)}
                </td>
                <td className={`py-1 text-right tabular-nums pr-1 ${confTone}`}>
                  {Math.round(conf * 100)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function drawOverlay(
  canvas: HTMLCanvasElement | null,
  image: HTMLImageElement,
  landmarks: Landmarks,
  pose: PoseEstimate
): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(image, 0, 0, w, h);

  // All landmarks as small dots
  ctx.fillStyle = "rgba(168, 85, 247, 0.6)";
  for (const p of landmarks) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, Math.max(1, w * 0.0015), 0, Math.PI * 2);
    ctx.fill();
  }

  // Face bounding box
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const p of landmarks) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }
  ctx.strokeStyle = "rgba(6, 182, 212, 0.6)";
  ctx.lineWidth = Math.max(1, w * 0.0025);
  ctx.strokeRect(xMin * w, yMin * h, (xMax - xMin) * w, (yMax - yMin) * h);

  // Midline (forehead → chin)
  const forehead = landmarks[10];
  const chin = landmarks[152];
  if (forehead && chin) {
    ctx.strokeStyle = "rgba(168, 85, 247, 0.4)";
    ctx.beginPath();
    ctx.moveTo(forehead.x * w, forehead.y * h);
    ctx.lineTo(chin.x * w, chin.y * h);
    ctx.stroke();
  }

  // Labeled key landmarks
  ctx.font = `${Math.max(10, w * 0.014)}px sans-serif`;
  ctx.textBaseline = "middle";
  for (const { key, label } of LABELED_LANDMARKS) {
    const idx = LANDMARK[key];
    const p = landmarks[idx];
    if (!p) continue;
    const px = p.x * w;
    const py = p.y * h;
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.beginPath();
    ctx.arc(px, py, Math.max(2, w * 0.003), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillText(label, px + 6, py);
  }

  // Pose annotation
  const padding = w * 0.015;
  ctx.fillStyle = "rgba(10, 8, 20, 0.85)";
  ctx.fillRect(padding, padding, w * 0.28, w * 0.085);
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.font = `${Math.max(11, w * 0.018)}px sans-serif`;
  ctx.textBaseline = "top";
  const line = (i: number, t: string) =>
    ctx.fillText(t, padding * 1.4, padding * 1.4 + i * w * 0.022);
  line(0, `yaw ${pose.yaw.toFixed(1)}°  pitch ${pose.pitch.toFixed(1)}°`);
  line(1, `roll ${pose.roll.toFixed(1)}°  front ${(pose.frontness * 100).toFixed(0)}%`);
  line(2, `${landmarks.length} landmarks`);
}
