"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Download, ImagePlus, Play, Sparkles } from "lucide-react";
import { DoodeeLogo } from "@/components/DoodeeLogo";
import { FaceCard } from "@/components/results/FaceCard";
import type { Category } from "@/lib/scoring";
import { tierFor } from "@/lib/scoring/tier";
import type { Tier } from "@/lib/scoring/tier";

type Stage = "idle" | "scanning" | "ready";

interface EditorResult {
  image: HTMLImageElement;
  overall: number;
  tier: Tier;
  categories: Partial<Record<Category, number>>;
}

const CATEGORY_ORDER: Category[] = [
  "harmony",
  "eye-area",
  "angularity",
  "dimorphism",
  "symmetry",
  "features",
];

const SCAN_STEPS = [
  "จัดกรอบภาพ",
  "อ่านโครงหน้า",
  "ปรับคะแนนย่อย",
  "ประกอบ Face Card",
];

interface AuraDot {
  x: number;
  y: number;
  r: number;
  delay: number;
  tone?: "cyan" | "violet";
}

const FEATURE_AURA_DOTS: AuraDot[] = [
  { x: 32, y: 53, r: 0.88, delay: 0.04 },
  { x: 36, y: 51, r: 0.68, delay: 0.08 },
  { x: 41, y: 52, r: 0.56, delay: 0.12 },
  { x: 59, y: 52, r: 0.56, delay: 0.16 },
  { x: 64, y: 51, r: 0.68, delay: 0.2 },
  { x: 68, y: 53, r: 0.88, delay: 0.24 },
  { x: 43, y: 68, r: 0.58, delay: 0.3, tone: "violet" },
  { x: 50, y: 72, r: 0.68, delay: 0.34 },
  { x: 57, y: 68, r: 0.58, delay: 0.38, tone: "violet" },
  { x: 38, y: 88, r: 0.62, delay: 0.44 },
  { x: 45, y: 91, r: 0.54, delay: 0.48 },
  { x: 50, y: 92, r: 0.7, delay: 0.52, tone: "violet" },
  { x: 55, y: 91, r: 0.54, delay: 0.56 },
  { x: 62, y: 88, r: 0.62, delay: 0.6 },
];

function EditorMediapipeAuraOverlay() {
  return (
    <svg
      aria-hidden
      className="editor-mediapipe-aura pointer-events-none absolute inset-[7%] text-cyan"
      viewBox="0 0 100 140"
      preserveAspectRatio="none"
    >
      {FEATURE_AURA_DOTS.map((dot, index) => (
        <circle
          key={`${dot.x}-${dot.y}-${index}`}
          className={`editor-aura-dot ${dot.tone === "violet" ? "editor-aura-dot-violet" : ""}`}
          cx={dot.x}
          cy={dot.y}
          r={dot.r}
          style={{ animationDelay: `${dot.delay}s` }}
        />
      ))}
    </svg>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function jitter(score: number, range: number): number {
  return clamp(score + (Math.random() * 2 - 1) * range, 1, 9.8);
}

function makeResult(score: number, image: HTMLImageElement): EditorResult {
  const overall = Number(jitter(score, 0.12).toFixed(1));
  return {
    image,
    overall,
    tier: tierFor(overall, "male"),
    categories: Object.fromEntries(
      CATEGORY_ORDER.map((key, index) => [
        key,
        Number(jitter(score + (index % 2 === 0 ? 0.18 : -0.18), 0.7).toFixed(1)),
      ]),
    ) as Partial<Record<Category, number>>,
  };
}

function score100(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score * 10)));
}

function easeOutQuart(progress: number): number {
  return 1 - (1 - progress) ** 4;
}

function useAnimatedNumber(target: number, durationMs: number): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    setValue(0);

    function tick(now: number): void {
      const progress = clamp((now - start) / durationMs, 0, 1);
      setValue(target * easeOutQuart(progress));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    }

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [durationMs, target]);

  return value;
}

function RecordingStage({
  result,
  children,
}: {
  result: EditorResult;
  children: ReactNode;
}) {
  const countProgress = useAnimatedNumber(1, 1700);
  const displayScore = Math.round(score100(result.overall) * countProgress);

  return (
    <div
      data-testid="editor-recording-stage"
      className="editor-recording-stage relative mx-auto flex min-h-[690px] w-full max-w-[760px] items-center justify-center overflow-hidden rounded-[2.4rem] border border-cyan/25 bg-[#020611] px-4 py-12 shadow-[0_34px_100px_-56px_rgba(0,0,0,0.95)] sm:px-8"
    >
      <div className="editor-recording-grid pointer-events-none absolute inset-0 opacity-45" />
      <div className="editor-recording-aura pointer-events-none absolute left-1/2 top-[48%] h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(6,182,212,0.20),transparent_31%),radial-gradient(circle_at_28%_70%,rgba(168,85,247,0.20),transparent_30%),linear-gradient(180deg,rgba(5,8,22,0.04),rgba(5,8,22,0.82))]" />
      <div className="editor-depth-panel pointer-events-none absolute left-1/2 top-1/2 h-[74%] w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-[2rem] border border-violet/20 bg-violet/[0.07]" />
      <div className="editor-orbit editor-orbit-a pointer-events-none absolute left-1/2 top-[47%] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan/20" />
      <div className="editor-orbit editor-orbit-b pointer-events-none absolute left-1/2 top-[47%] h-[390px] w-[390px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet/20" />
      <div className="editor-ready-flash pointer-events-none absolute inset-0" />
      <div className="editor-cinematic-sweep pointer-events-none absolute -left-1/3 top-0 h-full w-1/2 rotate-12 bg-gradient-to-r from-transparent via-cyan/22 to-transparent" />

      <div className="editor-score-burst pointer-events-none absolute left-1/2 top-[55%] z-30 -translate-x-1/2 -translate-y-1/2 rounded-[1.6rem] border border-cyan/25 bg-[#041826]/86 px-5 py-3 text-center shadow-[0_0_44px_rgba(6,182,212,0.22)] sm:hidden">
        <span className="block text-[9px] font-bold uppercase tracking-[0.32em] text-cyan/75">
          Face Card
        </span>
        <span
          data-testid="editor-ready-count-mobile"
          className="editor-score-number block font-serif text-5xl italic leading-none text-white"
        >
          {displayScore}
        </span>
      </div>

      <div className="editor-score-stack pointer-events-none absolute right-5 top-24 z-20 hidden text-right sm:block">
        <span className="block text-[10px] font-bold uppercase tracking-[0.32em] text-cyan/75">
          FACE CARD
        </span>
        <span
          data-testid="editor-ready-count"
          className="editor-score-number font-serif text-6xl italic leading-none text-white"
        >
          {displayScore}
        </span>
      </div>

      <div className="editor-facecard-recording relative z-10">{children}</div>
    </div>
  );
}

function loadImage(file: File): Promise<{ image: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image-load-failed"));
    };
    image.src = url;
  });
}

function clearTimers(timers: number[]): void {
  for (const timer of timers) window.clearTimeout(timer);
  timers.length = 0;
}

export function EditorFaceCardPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const timersRef = useRef<number[]>([]);
  const scoreFrameRef = useRef<number | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [scanStep, setScanStep] = useState(0);
  const [score, setScore] = useState(7.5);
  const [scanScore, setScanScore] = useState(0);
  const [result, setResult] = useState<EditorResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      clearTimers(timers);
      if (scoreFrameRef.current !== null) {
        window.cancelAnimationFrame(scoreFrameRef.current);
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const setFile = useCallback(async (file: File | null) => {
    if (!file) return;
    clearTimers(timersRef.current);
    if (scoreFrameRef.current !== null) {
      window.cancelAnimationFrame(scoreFrameRef.current);
      scoreFrameRef.current = null;
    }
    setError(null);
    setResult(null);
    setScanScore(0);
    try {
      const loaded = await loadImage(file);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = loaded.url;
      imageRef.current = loaded.image;
      setPhotoUrl(loaded.url);
      setStage("idle");
      setScanStep(0);
    } catch {
      setError("โหลดรูปไม่สำเร็จ ลองเลือกรูปใหม่");
    }
  }, []);

  const runScan = useCallback(() => {
    const image = imageRef.current;
    if (!image) {
      inputRef.current?.click();
      return;
    }
    clearTimers(timersRef.current);
    if (scoreFrameRef.current !== null) {
      window.cancelAnimationFrame(scoreFrameRef.current);
      scoreFrameRef.current = null;
    }
    setResult(null);
    setStage("scanning");
    setScanStep(0);
    setScanScore(0);
    window.requestAnimationFrame(() => {
      previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const scoreStart = performance.now();
    const scoreDuration = 2350;
    const tickScore = (now: number): void => {
      const progress = clamp((now - scoreStart) / scoreDuration, 0, 1);
      setScanScore(Number((score * easeOutQuart(progress)).toFixed(1)));
      if (progress < 1) {
        scoreFrameRef.current = window.requestAnimationFrame(tickScore);
      }
    };
    scoreFrameRef.current = window.requestAnimationFrame(tickScore);

    SCAN_STEPS.slice(1).forEach((_, index) => {
      timersRef.current.push(
        window.setTimeout(() => setScanStep(index + 1), 620 * (index + 1)),
      );
    });

    timersRef.current.push(
      window.setTimeout(() => {
        setScanScore(score);
        setResult(makeResult(score, image));
        setStage("ready");
        window.requestAnimationFrame(() => {
          previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }, 2600),
    );
  }, [score]);

  return (
    <main className="theme-locked-dark app-glass-page min-h-[100dvh] overflow-x-hidden bg-[radial-gradient(circle_at_20%_10%,rgba(168,85,247,0.22),transparent_34%),radial-gradient(circle_at_86%_22%,rgba(6,182,212,0.16),transparent_32%),linear-gradient(180deg,#050816_0%,#070B1A_54%,#0B1020_100%)] px-4 py-5 text-[#f8fafc]">
      <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-[0_28px_90px_-60px_rgba(0,0,0,0.95)] backdrop-blur-md">
          <DoodeeLogo
            markClassName="h-11 w-11 border border-cyan/25 bg-cyan/[0.10] p-1.5"
            wordmarkClassName="text-3xl text-white"
            subtitle="EDITOR CARD"
            subtitleClassName="text-cyan"
          />

          <div className="mt-8 space-y-4">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.08] px-5 text-sm font-semibold text-white transition hover:bg-white/[0.12] active:scale-[0.98]"
            >
              <ImagePlus className="h-4 w-4 text-cyan" />
              เลือกรูปสำหรับ editor
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => void setFile(event.currentTarget.files?.[0] ?? null)}
            />

            <label className="block rounded-3xl border border-white/10 bg-white/[0.05] p-4">
              <span className="flex items-center justify-between text-sm font-semibold">
                คะแนนเป้าหมาย
                <span className="font-serif text-3xl italic">{score.toFixed(1)}</span>
              </span>
              <input
                type="range"
                min="1"
                max="10"
                step="0.1"
                value={score}
                onChange={(event) => setScore(Number(event.currentTarget.value))}
                className="mt-4 w-full accent-cyan"
              />
              <span className="mt-2 block text-xs text-[#cbd5e1]">
                ใช้ FaceCard renderer เดียวกับเว็บหลัก ไม่ใช้ AI ไม่หักโควต้า
              </span>
            </label>

            <button
              type="button"
              onClick={runScan}
              data-testid="editor-run"
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-bold text-[#050816] shadow-[0_0_44px_rgba(168,85,247,0.34)] transition hover:bg-[#f8fafc] active:scale-[0.98]"
            >
              <Play className="h-4 w-4" />
              เริ่มสแกน editor
            </button>

            {stage === "ready" && (
              <div className="rounded-3xl border border-cyan/20 bg-cyan/[0.08] p-4 text-sm font-semibold text-cyan">
                <Download className="mr-2 inline h-4 w-4" />
                ปุ่มดาวน์โหลดใช้ชุดเดียวกับ FaceCard หลักด้านขวา
              </div>
            )}

            {error && <p className="text-sm font-medium text-red-200">{error}</p>}
          </div>
        </section>

        <section
          ref={previewRef}
          className="relative min-h-[680px] scroll-mt-4 overflow-hidden rounded-[2.2rem] border border-white/10 bg-[#050816]/55 p-4 shadow-[0_34px_110px_-70px_rgba(0,0,0,0.95)]"
        >
          {stage === "scanning" && (
            <div
              data-testid="editor-scan-overlay"
              className="absolute inset-0 z-10 grid place-items-center bg-[#050816] p-3 sm:p-5"
            >
              <div className="w-full max-w-4xl">
                <div className="mx-auto max-w-[min(100%,640px)]">
                  <div className="editor-analyzer relative aspect-[9/13] transform-gpu overflow-hidden rounded-[2rem] border border-white/10 bg-[#030711] shadow-[0_0_60px_rgba(6,182,212,0.18)] sm:aspect-[4/5]">
                    <div className="editor-photo-aura pointer-events-none absolute left-1/2 top-[46%] h-[78%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full" />
                    {photoUrl && (
                      <div
                        className="absolute inset-0 bg-contain bg-center bg-no-repeat opacity-100"
                        style={{ backgroundImage: `url(${photoUrl})` }}
                      />
                    )}
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,182,212,0.055)_1px,transparent_1px),linear-gradient(0deg,rgba(6,182,212,0.055)_1px,transparent_1px)] bg-[size:38px_38px] opacity-45" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_0%,rgba(3,7,17,0.04)_52%,rgba(3,7,17,0.44)_100%)]" />
                    <div className="editor-scan-focus pointer-events-none absolute inset-0" />
                    <EditorMediapipeAuraOverlay />
                    <div className="editor-aura-score pointer-events-none absolute bottom-7 right-7 rounded-2xl border border-cyan/18 bg-[#03111f]/55 px-3.5 py-2 text-right shadow-[0_0_28px_rgba(6,182,212,0.18)]">
                      <span
                        data-testid="editor-scan-count-lock"
                        className="editor-score-number font-serif text-3xl italic text-white/92"
                      >
                        {scanScore.toFixed(1)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan/30 bg-cyan/[0.09] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.34em] text-cyan shadow-[0_0_30px_rgba(6,182,212,0.16)]">
                      <Sparkles className="h-3.5 w-3.5" />
                      Analyzing
                    </div>
                    <h2
                      data-testid="editor-scan-count"
                      className="editor-score-number mt-4 font-serif text-5xl italic tracking-tight text-white sm:text-6xl"
                    >
                      {scanScore.toFixed(1)}
                    </h2>
                    <p className="editor-loading-line mx-auto mt-2 max-w-xs text-[11px] font-semibold uppercase tracking-[0.28em] text-white/58">
                      Rendering face card
                    </p>
                  </div>

                  <div className="mt-5 grid gap-2 sm:grid-cols-4">
                    {SCAN_STEPS.map((step, index) => (
                      <div
                        key={step}
                        className={`rounded-2xl border px-3 py-2 text-center text-[11px] font-semibold transition ${
                          index <= scanStep
                            ? "border-cyan/40 bg-cyan/[0.12] text-white shadow-[0_0_24px_rgba(6,182,212,0.12)]"
                            : "border-white/10 bg-white/[0.04] text-white/45"
                        }`}
                      >
                        {step}
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet to-cyan transition-all duration-500"
                      style={{
                        width: `${((scanStep + 1) / SCAN_STEPS.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div
            data-testid="editor-facecard-shell"
            className={`transition duration-700 ${
              stage === "ready" ? "editor-card-pop translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.985] opacity-70"
            }`}
          >
            {result ? (
              <RecordingStage result={result}>
                <FaceCard
                  image={result.image}
                  overall={result.overall}
                  tier={result.tier}
                  categories={result.categories}
                />
              </RecordingStage>
            ) : photoUrl ? (
              <div className="grid min-h-[650px] place-items-center px-6 py-8">
                <div className="w-full max-w-[320px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#030711] shadow-[0_0_60px_rgba(6,182,212,0.14)]">
                  <img
                    src={photoUrl}
                    alt="รูปที่เลือกสำหรับ editor"
                    className="aspect-[4/5] w-full object-cover"
                  />
                </div>
                <p className="mt-4 max-w-sm text-center text-sm leading-relaxed text-[#cbd5e1]">
                  อัปโหลดรูปแล้ว — เลือกคะแนนเป้าหมายแล้วกด &ldquo;เริ่มสแกน editor&rdquo;
                </p>
              </div>
            ) : (
              <div className="grid min-h-[650px] place-items-center px-6 text-center">
                <div className="max-w-sm rounded-3xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-md">
                  <p className="text-xl font-bold">อัปโหลดรูปแล้วเลือกคะแนน</p>
                  <p className="mt-2 text-sm leading-relaxed text-[#cbd5e1]">
                    output จะใช้การ์ดจริงตัวเดียวกับหน้า scan เพื่อให้หน้าตาตรงเว็บหลัก
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Was `<style jsx global>` upstream. styled-jsx ships with Next and is
          not available here, so React rendered the props as literal
          `jsx="true" global="true"` attributes and warned twice on every
          mount. Dropping them is behaviour-preserving: `global` told styled-jsx
          NOT to scope the rules, which is exactly what a plain <style> does.
          The rules below are all class- or keyframe-scoped by hand. */}
      <style>{`
        @keyframes editorScanFocus {
          0% {
            opacity: 0.20;
            transform: scale(0.94);
          }
          45% {
            opacity: 0.78;
            transform: scale(1.04);
          }
          100% {
            opacity: 0.22;
            transform: scale(1.1);
          }
        }
        .editor-scan-focus {
          background:
            radial-gradient(ellipse at 50% 42%, rgba(6, 182, 212, 0.18), transparent 21%),
            radial-gradient(ellipse at 50% 54%, transparent 0 31%, rgba(6, 182, 212, 0.10) 32%, transparent 52%),
            radial-gradient(ellipse at 50% 60%, rgba(168, 85, 247, 0.11), transparent 44%);
          animation: editorScanFocus 2.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
          mix-blend-mode: screen;
          will-change: transform, opacity;
        }
        .editor-photo-aura {
          background:
            radial-gradient(ellipse at 50% 42%, rgba(6, 182, 212, 0.24), transparent 47%),
            radial-gradient(ellipse at 48% 58%, rgba(168, 85, 247, 0.16), transparent 55%);
          animation: editorPhotoAura 3.4s ease-in-out infinite;
          filter: blur(18px);
          mix-blend-mode: screen;
          will-change: opacity, transform;
        }
        .editor-mediapipe-aura {
          filter: drop-shadow(0 0 12px rgba(6, 182, 212, 0.55));
          mix-blend-mode: screen;
        }
        .editor-aura-dot {
          fill: currentColor;
          opacity: 0;
          transform-box: fill-box;
          transform-origin: center;
          animation: editorAuraDot 1.9s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }
        .editor-aura-dot-violet {
          fill: rgb(168, 85, 247);
        }
        .editor-aura-score {
          animation: editorAuraScore 2.4s ease-in-out infinite;
          backdrop-filter: blur(4px);
        }
        .editor-analyzer {
          animation: editorPulse 2.6s ease-in-out both;
          contain: layout paint style;
          will-change: transform, opacity;
        }
        .editor-score-number {
          font-variant-numeric: tabular-nums;
          text-shadow:
            0 0 18px rgba(6, 182, 212, 0.38),
            0 0 42px rgba(168, 85, 247, 0.18);
        }
        .editor-loading-line {
          animation: editorLoadingLine 1.15s ease-in-out infinite;
        }
        .editor-card-pop {
          animation: editorCardPop 0.62s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .editor-recording-stage {
          contain: layout paint style;
        }
        .editor-recording-grid {
          background-image:
            linear-gradient(90deg, rgba(6, 182, 212, 0.10) 1px, transparent 1px),
            linear-gradient(0deg, rgba(6, 182, 212, 0.10) 1px, transparent 1px);
          background-size: 42px 42px;
          animation: editorGridDrift 12s linear infinite;
          will-change: background-position;
        }
        .editor-depth-panel {
          animation: editorDepthPanel 5.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
          box-shadow:
            0 0 42px rgba(168, 85, 247, 0.16),
            inset 0 0 42px rgba(6, 182, 212, 0.08);
          will-change: transform, opacity;
        }
        .editor-orbit {
          box-shadow: inset 0 0 42px rgba(6, 182, 212, 0.08);
          will-change: transform, opacity;
        }
        .editor-orbit::before,
        .editor-orbit::after {
          content: "";
          position: absolute;
          border-radius: 999px;
          background: #8df1ff;
          box-shadow: 0 0 24px rgba(6, 182, 212, 0.9);
        }
        .editor-orbit::before {
          left: 50%;
          top: -4px;
          height: 8px;
          width: 8px;
        }
        .editor-orbit::after {
          bottom: 9%;
          right: 12%;
          height: 5px;
          width: 5px;
          opacity: 0.7;
        }
        .editor-orbit-a {
          animation: editorOrbitA 13s linear infinite;
        }
        .editor-orbit-b {
          animation: editorOrbitB 9s linear infinite;
        }
        .editor-ready-flash {
          animation: editorReadyFlash 4.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
          background:
            radial-gradient(circle at 50% 44%, rgba(255, 255, 255, 0.15), transparent 18%),
            radial-gradient(circle at 50% 44%, rgba(6, 182, 212, 0.22), transparent 34%);
          will-change: opacity, transform;
        }
        .editor-cinematic-sweep {
          animation: editorCinematicSweep 5.6s cubic-bezier(0.22, 1, 0.36, 1) infinite;
          will-change: transform, opacity;
        }
        .editor-recording-aura {
          animation: editorRecordingAura 5.2s ease-in-out infinite;
          background:
            radial-gradient(circle at 50% 50%, rgba(6, 182, 212, 0.24), transparent 34%),
            radial-gradient(circle at 44% 58%, rgba(168, 85, 247, 0.22), transparent 42%),
            conic-gradient(from 120deg, rgba(6, 182, 212, 0), rgba(6, 182, 212, 0.18), rgba(168, 85, 247, 0.18), rgba(6, 182, 212, 0));
          filter: blur(24px);
          opacity: 0.72;
          will-change: transform, opacity;
        }
        .editor-score-stack {
          animation: editorScoreBreath 4.4s ease-in-out infinite;
          text-shadow: 0 0 28px rgba(6, 182, 212, 0.32);
          will-change: transform, opacity;
        }
        .editor-score-burst {
          animation: editorScoreBurst 1.95s cubic-bezier(0.22, 1, 0.36, 1) both;
          backdrop-filter: blur(6px);
          will-change: transform, opacity;
        }
        .editor-facecard-recording {
          animation: editorCardCompose 0.92s cubic-bezier(0.22, 1, 0.36, 1) both;
          filter: drop-shadow(0 34px 44px rgba(0, 0, 0, 0.42));
          width: min(360px, 72vw, 45vh);
        }
        .editor-facecard-recording .space-y-3 {
          margin: 0;
        }
        /* Float only the card preview — the infinite float used to sit on
           the whole wrapper, which kept the Download/Share buttons in
           perpetual motion, so real taps/clicks landed on a moving target
           and never registered. Buttons must stay still. */
        .editor-facecard-recording .space-y-3 > button {
          width: 100%;
          animation: editorCardFloat 5.4s 0.92s ease-in-out infinite;
          will-change: transform;
        }
        /* Hide only the caption line inside FaceCard — the action row
           (Download PNG / Share / Fullscreen) must stay visible; hiding
           it made the sidebar's "download uses the FaceCard buttons"
           promise point at nothing and left /editor with no way to save
           the card. */
        .editor-facecard-recording .space-y-3 > p {
          display: none;
        }
        .editor-facecard-recording .space-y-3 > .flex {
          margin-top: 14px;
        }
        .editor-facecard-recording .space-y-3 > .flex .facecard-download-button {
          box-shadow: 0 0 34px rgba(6, 182, 212, 0.3);
        }
        .editor-facecard-recording .space-y-3 > button > div {
          border-color: rgba(6, 182, 212, 0.28) !important;
          max-width: none !important;
          width: 100% !important;
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.08),
            0 28px 80px -42px rgba(6, 182, 212, 0.7) !important;
        }
        @keyframes editorPhotoAura {
          0%,
          100% {
            opacity: 0.48;
            transform: translate(-50%, -50%) scale(0.92);
          }
          50% {
            opacity: 0.88;
            transform: translate(-50%, -50%) scale(1.06);
          }
        }
        @keyframes editorAuraDot {
          0%,
          100% {
            opacity: 0.22;
            transform: scale(0.82);
          }
          42% {
            opacity: 0.96;
            transform: scale(1.55);
          }
        }
        @keyframes editorAuraScore {
          0%,
          100% {
            opacity: 0.68;
            transform: translateY(0) scale(0.98);
          }
          50% {
            opacity: 1;
            transform: translateY(-2px) scale(1.02);
          }
        }
        @keyframes editorPulse {
          0% {
            transform: scale(0.985);
            opacity: 0.82;
          }
          45% {
            transform: scale(1);
            opacity: 1;
          }
          100% {
            transform: scale(0.99);
            opacity: 0.96;
          }
        }
        @keyframes editorRecordingAura {
          0% {
            transform: translate(-50%, -50%) scale(0.94) rotate(0deg);
            opacity: 0.46;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.08) rotate(18deg);
            opacity: 0.88;
          }
          100% {
            transform: translate(-50%, -50%) scale(0.94) rotate(36deg);
            opacity: 0.46;
          }
        }
        @keyframes editorLoadingLine {
          0%,
          100% {
            opacity: 0.42;
            transform: translateY(0);
          }
          50% {
            opacity: 0.92;
            transform: translateY(-1px);
          }
        }
        @keyframes editorCardPop {
          0% {
            opacity: 0;
            transform: translateY(24px) scale(0.94);
          }
          68% {
            opacity: 1;
            transform: translateY(-3px) scale(1.012);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes editorGridDrift {
          from {
            background-position: 0 0;
          }
          to {
            background-position: 84px 42px;
          }
        }
        @keyframes editorDepthPanel {
          0%,
          100% {
            opacity: 0.52;
            transform: translate(-50%, -50%) scale(0.98) rotate(-2deg);
          }
          50% {
            opacity: 0.86;
            transform: translate(-50%, -51%) scale(1.03) rotate(2deg);
          }
        }
        @keyframes editorOrbitA {
          from {
            transform: translate(-50%, -50%) rotate(0deg) scale(1);
          }
          to {
            transform: translate(-50%, -50%) rotate(360deg) scale(1);
          }
        }
        @keyframes editorOrbitB {
          from {
            transform: translate(-50%, -50%) rotate(360deg) scale(0.98);
          }
          to {
            transform: translate(-50%, -50%) rotate(0deg) scale(0.98);
          }
        }
        @keyframes editorReadyFlash {
          0%,
          72%,
          100% {
            opacity: 0;
            transform: scale(0.96);
          }
          82% {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes editorCinematicSweep {
          0% {
            opacity: 0;
            transform: translateX(-35%) rotate(12deg);
          }
          18%,
          42% {
            opacity: 0.92;
          }
          64%,
          100% {
            opacity: 0;
            transform: translateX(300%) rotate(12deg);
          }
        }
        @keyframes editorHudRise {
          from {
            opacity: 0;
            transform: translateY(-10px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes editorScoreBreath {
          0%,
          100% {
            opacity: 0.74;
            transform: translateY(0) scale(1);
          }
          50% {
            opacity: 1;
            transform: translateY(-4px) scale(1.035);
          }
        }
        @keyframes editorScoreBurst {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.72);
          }
          24% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.08);
          }
          72% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.92);
          }
        }
        @keyframes editorCardCompose {
          0% {
            opacity: 0;
            transform: translateY(28px) scale(0.86) rotate(-2.2deg);
            filter: blur(8px);
          }
          58% {
            opacity: 1;
            transform: translateY(-4px) scale(1.035) rotate(0.8deg);
            filter: blur(0);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1) rotate(-0.35deg);
            filter: blur(0);
          }
        }
        @keyframes editorCardFloat {
          0%,
          100% {
            transform: translateY(0) rotate(-0.35deg) scale(1);
          }
          50% {
            transform: translateY(-8px) rotate(0.35deg) scale(1.012);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .editor-photo-aura,
          .editor-aura-dot,
          .editor-aura-score,
          .editor-recording-aura,
          .editor-score-burst,
          .editor-scan-focus,
          .editor-loading-line,
          .editor-analyzer,
          .editor-card-pop,
          .editor-recording-grid,
          .editor-depth-panel,
          .editor-orbit-a,
          .editor-orbit-b,
          .editor-ready-flash,
          .editor-cinematic-sweep,
          .editor-score-stack,
          .editor-facecard-recording {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}
