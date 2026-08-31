import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Clock3,
  ScanFace,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";
import type { PublicValidationSnapshot } from "@/types/validation-snapshot";

type ValidationSnapshotViewProps = {
  snapshot: PublicValidationSnapshot;
};

type MetricCard = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  accent: string;
  valueClassName?: string;
};

const countFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});

function formatCount(value: number): string {
  return countFormatter.format(value);
}

function formatTimestamp(value: string): string {
  return `${dateFormatter.format(new Date(value))} น.`;
}

export function ValidationSnapshotView({
  snapshot,
}: ValidationSnapshotViewProps) {
  const { metrics } = snapshot;
  const cards: MetricCard[] = [
    {
      label: "ผู้ใช้ทั้งหมด",
      value: formatCount(metrics.totalUsers),
      detail: "บัญชีจริงในระบบ",
      icon: Users,
      accent: "text-cyan",
    },
    {
      label: "ใช้งานวันนี้",
      value: formatCount(metrics.activeUsers24h),
      detail: "ผู้ใช้ใน 24 ชั่วโมง",
      icon: Activity,
      accent: "text-emerald-300",
    },
    {
      label: "ใช้งาน 7 วัน",
      value: formatCount(metrics.activeUsers7d),
      detail: "ผู้ใช้ใน 7 วันที่ผ่านมา",
      icon: Sparkles,
      accent: "text-violet-300",
    },
    {
      label: "การใช้งานสำเร็จ",
      value: formatCount(metrics.totalSuccessfulOperations),
      detail: `วิเคราะห์ ${formatCount(metrics.totalFaceAnalyses)} · พรีวิว ${formatCount(metrics.totalProcedurePreviews)}`,
      icon: ScanFace,
      accent: "text-sky-300",
    },
    {
      label: "ลูกค้าที่จ่ายเงินจริง",
      value: formatCount(metrics.payingCustomers),
      detail: "มีสัญญาณการจ่ายแล้ว",
      icon: ShieldCheck,
      accent: "text-amber-300",
    },
    {
      label: "รายรับรวม",
      value: `฿${countFormatter.format(metrics.lifetimeRevenueThb)}`,
      detail: "ยอดชำระจริงสะสม",
      icon: WalletCards,
      accent: "text-rose-300",
      valueClassName: "text-[1.85rem] sm:text-[2.15rem]",
    },
  ];

  return (
    <main className="relative min-h-[100dvh] bg-[radial-gradient(circle_at_8%_0%,rgba(168,85,247,0.20),transparent_32%),radial-gradient(circle_at_95%_12%,rgba(6,182,212,0.14),transparent_30%),linear-gradient(145deg,#050816_0%,#070B1A_48%,#0B1020_100%)] text-slate-50">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.10)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.10)_1px,transparent_1px)] [background-size:56px_56px]"
      />

      <div className="relative mx-auto w-full max-w-6xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 lg:px-8 lg:py-8">
        <header className="flex min-h-11 items-center justify-between gap-4">
          <Link
            href="/"
            aria-label="DooDee home"
            className="inline-flex min-h-11 items-center gap-3 rounded-xl pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/70"
          >
            <Image
              src="/doodee-logo.webp"
              alt=""
              width={40}
              height={40}
              priority
              className="h-10 w-10 rounded-xl"
            />
            <span className="text-sm font-semibold tracking-[0.16em] text-white">
              DOODEE
            </span>
          </Link>

          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.07] px-3 py-1.5 text-[11px] font-semibold text-emerald-200">
            ข้อมูลจากระบบ
          </span>
        </header>

        <section className="mt-8 grid gap-5 lg:mt-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:items-end lg:gap-10">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan">
              Validation snapshot
            </p>
            <h1 className="mt-3 max-w-3xl font-serif text-[2.7rem] font-light italic leading-[0.98] tracking-[-0.02em] text-white sm:text-6xl lg:text-7xl">
              ข้อมูลจริง ณ เวลาที่บันทึก
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base sm:leading-7">
              ภาพรวมการใช้งาน DooDee จากระบบจริง เพื่อแสดงสิ่งที่เกิดขึ้นกับผลิตภัณฑ์ในขณะนั้น
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.10] bg-white/[0.045] p-4 shadow-[0_24px_70px_-48px_rgba(0,0,0,0.95)] sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-cyan/20 bg-cyan/[0.08] text-cyan">
                <Clock3 aria-hidden size={19} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white">บันทึกเมื่อ</p>
                <time
                  dateTime={snapshot.capturedAt}
                  className="mt-1 block text-sm leading-5 text-slate-200"
                >
                  {formatTimestamp(snapshot.capturedAt)}
                </time>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  ตัวเลขถูกแช่ไว้ตามเวลานี้ ไม่ใช่ข้อมูลสด
                </p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="snapshot-metrics" className="mt-7 lg:mt-10">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="snapshot-metrics" className="text-sm font-semibold text-white">
              ภาพรวมที่บันทึกไว้
            </h2>
            <span className="text-[11px] text-slate-500">6 ตัวเลขสำคัญ</span>
          </div>

          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-3 lg:gap-4">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <article
                  key={card.label}
                  data-testid="snapshot-metric-card"
                  className="flex min-h-[148px] flex-col rounded-2xl border border-white/[0.09] bg-[linear-gradient(145deg,rgba(255,255,255,0.065),rgba(255,255,255,0.025))] p-4 shadow-[0_20px_52px_-42px_rgba(0,0,0,0.95)] sm:min-h-[158px] sm:p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium leading-5 text-slate-300">
                      {card.label}
                    </p>
                    <Icon aria-hidden size={18} className={card.accent} />
                  </div>
                  <p
                    className={`mt-auto font-serif text-[2.25rem] font-light italic leading-none tabular-nums text-white sm:text-[2.6rem] ${card.valueClassName ?? ""}`}
                  >
                    {card.value}
                  </p>
                  <p className="mt-2 text-[11px] leading-4 text-slate-400 sm:text-xs">
                    {card.detail}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/[0.09] bg-[#050816]/70 p-4 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck
              aria-hidden
              size={20}
              className="mt-0.5 flex-none text-cyan"
            />
            <div>
              <h2 className="text-sm font-semibold text-white">แสดงเฉพาะข้อมูลรวม</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                หน้านี้ไม่มีชื่อ อีเมล รูปภาพ รหัสผู้ใช้ หรือข้อมูลส่วนตัวอื่น
              </p>
            </div>
          </div>
          <p className="mt-4 border-t border-white/[0.08] pt-4 text-xs leading-5 text-slate-500 sm:mt-0 sm:max-w-xs sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
            เปิดดูได้ถึง {formatTimestamp(snapshot.expiresAt)}
          </p>
        </section>

        <footer className="mt-7 flex items-center justify-between border-t border-white/[0.08] pt-5 text-[11px] text-slate-500">
          <span>DooDee validation proof</span>
          <span>Snapshot v{snapshot.schemaVersion}</span>
        </footer>
      </div>
    </main>
  );
}
