import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Calendar, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "../DashboardPage";
import { deleteScan, getScans } from "../../lib/api";
import { errorMessage } from "../../lib/apiError";
import { overallScore } from "../../lib/dashboardData";
import { useLocale } from "../../useLocale";

const COPY = {
  th: {
    eyebrow: "ประวัติการสแกน",
    heading: "ผลสแกนของคุณ",
    intro: "สำหรับบัญชีผู้ใหญ่เท่านั้น · รูปต้นฉบับจะถูกลบภายใน 30 วัน ส่วนค่าที่วัดได้และคะแนนยังอยู่ครบ",
    loading: "กำลังโหลดผลสแกน…",
    emptyTitle: "ยังไม่มีผลสแกน",
    emptyBody: "การสแกนครั้งแรกใช้เวลาประมาณหนึ่งนาที",
    startScan: "เริ่มสแกน",
    overall: (score: string) => `คะแนนรวม ${score}`,
    measurements: (count: number) => `${count} ค่าที่วัดได้`,
    statuses: {
      uploading: "กำลังอัปโหลด",
      queued: "รอคิว",
      processing: "กำลังประมวลผล",
      completed: "เสร็จแล้ว",
      failed: "ล้มเหลว",
      cancelled: "ยกเลิก",
      deletion_pending: "รอลบ",
    } as Record<string, string>,
    confirmLabel: "ยืนยันการลบ",
    confirmQuestion: "ลบผลสแกนนี้พร้อมรูปทั้งหมดไหม?",
    keep: "เก็บไว้",
    deleting: "กำลังลบ…",
    delete: "ลบ",
    deleteThis: "ลบผลสแกนนี้",
  },
  en: {
    eyebrow: "History",
    heading: "Your scans.",
    intro: "Adult accounts only. Source images are deleted within 30 days; the measurements and scores stay.",
    loading: "Loading your scans…",
    emptyTitle: "No scans yet",
    emptyBody: "Your first capture takes about a minute.",
    startScan: "Start a scan",
    overall: (score: string) => `Overall ${score}`,
    measurements: (count: number) => `${count} measurements`,
    statuses: {
      uploading: "Uploading",
      queued: "Queued",
      processing: "Processing",
      completed: "Done",
      failed: "Failed",
      cancelled: "Cancelled",
      deletion_pending: "Being deleted",
    } as Record<string, string>,
    confirmLabel: "Confirm delete",
    confirmQuestion: "Delete this scan and its images?",
    keep: "Keep",
    deleting: "Deleting…",
    delete: "Delete",
    deleteThis: "Delete this scan",
  },
} as const;

/**
 * qijek had no history page, so this is built from its own parts: app-view, app-page-title and
 * GlassCard. Behaviour is unchanged from the view it replaces — list scans, delete one — except
 * that deletion now confirms inside the page instead of through a native window.confirm.
 */
export default function HistoryPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { locale } = useLocale();
  const c = COPY[locale === "en" ? "en" : "th"];
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const scans = useQuery({ queryKey: ["scans"], queryFn: getScans });
  const remove = useMutation({
    mutationFn: (scanId: string) => deleteScan(scanId),
    onSuccess: () => {
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ["scans"] });
    },
  });

  const list = scans.data || [];

  return (
    <div className="app-view history-view">
      <div className="app-page-title">
        <span className="eyebrow">{c.eyebrow}</span>
        <h1>{c.heading}</h1>
        <p>{c.intro}</p>
      </div>

      {scans.isLoading && (
        <GlassCard className="history-empty">
          <p aria-busy="true">{c.loading}</p>
        </GlassCard>
      )}

      {scans.error && (
        <GlassCard className="history-empty">
          <p role="alert">{errorMessage(scans.error) || (scans.error as Error).message}</p>
        </GlassCard>
      )}

      {scans.isSuccess && !list.length && (
        <GlassCard className="history-empty">
          <strong>{c.emptyTitle}</strong>
          <p>{c.emptyBody}</p>
          <button type="button" onClick={() => navigate("/onboarding")}>
            <Plus /> {c.startScan}
          </button>
        </GlassCard>
      )}

      <div className="history-list">
        {list.map((scan: any) => {
          const overall = overallScore(scan);
          // Only stated when there is one. `analysis_data.reference_scores.metrics` is absent on
          // a scan that never finished scoring and on the four `deletion_pending` rows in this
          // deployment, and `|| 0` turned every one of those into the sentence "0 ค่าที่วัดได้" —
          // a measured result of nothing, rather than a scan with no measurements to report.
          const metricCount = scan.analysis_data?.reference_scores?.metrics?.length ?? 0;
          return (
            <GlassCard className="history-row" key={scan.id}>
              <button
                className="history-row__open"
                type="button"
                onClick={() => navigate(`/analysis?scan_id=${encodeURIComponent(scan.id)}`)}
              >
                <span>
                  {/* A status is a word, not a code. `scan.status` went to the screen raw, so a
                      row awaiting deletion was headed "deletion_pending" in both languages. */}
                  <strong>
                    {overall === null
                      ? c.statuses[scan.status] ?? scan.status
                      : c.overall(overall.toFixed(1))}
                  </strong>
                  <small>
                    <Calendar size={12} /> {new Date(scan.created_at).toLocaleString(locale)}
                    {/* The scored metrics live under analysis_data.reference_scores, the same
                        place overallScore() reads them from. Counting analysis_data.metrics
                        found nothing, so every row claimed 0 measurements. */}
                    {metricCount > 0 ? ` · ${c.measurements(metricCount)}` : ""}
                  </small>
                </span>
                <ArrowRight />
              </button>
              {pendingDelete === scan.id ? (
                <div className="history-row__confirm" role="alertdialog" aria-label={c.confirmLabel}>
                  <span>{c.confirmQuestion}</span>
                  <button type="button" onClick={() => setPendingDelete(null)}>
                    {c.keep}
                  </button>
                  <button
                    className="is-danger"
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(scan.id)}
                  >
                    {remove.isPending ? c.deleting : c.delete}
                  </button>
                </div>
              ) : (
                <button
                  className="history-row__delete"
                  type="button"
                  onClick={() => setPendingDelete(scan.id)}
                  aria-label={c.deleteThis}
                >
                  <Trash2 size={17} />
                </button>
              )}
            </GlassCard>
          );
        })}
      </div>

      {remove.error && (
        <p className="history-error" role="alert">
          {errorMessage(remove.error) || (remove.error as Error).message}
        </p>
      )}
    </div>
  );
}
