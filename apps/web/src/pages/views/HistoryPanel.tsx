import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Calendar, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "../DashboardPage";
import { deleteScan, getScans } from "../../lib/api";
import { errorMessage } from "../../lib/apiError";
import { overallScore } from "../../lib/dashboardData";

/**
 * qijek had no history page, so this is built from its own parts: app-view, app-page-title and
 * GlassCard. Behaviour is unchanged from the view it replaces — list scans, delete one — except
 * that deletion now confirms inside the page instead of through a native window.confirm.
 */
export default function HistoryPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
        <span className="eyebrow">History</span>
        <h1>Your scans.</h1>
        <p>Adult accounts only. Source images are deleted within 30 days.</p>
      </div>

      {scans.isLoading && (
        <GlassCard className="history-empty">
          <p aria-busy="true">Loading your scans…</p>
        </GlassCard>
      )}

      {scans.error && (
        <GlassCard className="history-empty">
          <p role="alert">{errorMessage(scans.error) || (scans.error as Error).message}</p>
        </GlassCard>
      )}

      {scans.isSuccess && !list.length && (
        <GlassCard className="history-empty">
          <strong>No scans yet</strong>
          <p>Your first capture takes about a minute.</p>
          <button type="button" onClick={() => navigate("/onboarding")}>
            <Plus /> Start a scan
          </button>
        </GlassCard>
      )}

      <div className="history-list">
        {list.map((scan: any) => {
          const overall = overallScore(scan);
          return (
            <GlassCard className="history-row" key={scan.id}>
              <button
                className="history-row__open"
                type="button"
                onClick={() => navigate(`/analysis?scan_id=${encodeURIComponent(scan.id)}`)}
              >
                <span>
                  <strong>{overall === null ? scan.status : `Overall ${overall.toFixed(1)}`}</strong>
                  <small>
                    <Calendar size={12} /> {new Date(scan.created_at).toLocaleString()} ·{" "}
                    {scan.analysis_data?.metrics?.length || 0} measurements
                  </small>
                </span>
                <ArrowRight />
              </button>
              {pendingDelete === scan.id ? (
                <div className="history-row__confirm" role="alertdialog" aria-label="Confirm delete">
                  <span>Delete this scan and its images?</span>
                  <button type="button" onClick={() => setPendingDelete(null)}>
                    Keep
                  </button>
                  <button
                    className="is-danger"
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(scan.id)}
                  >
                    {remove.isPending ? "Deleting…" : "Delete"}
                  </button>
                </div>
              ) : (
                <button
                  className="history-row__delete"
                  type="button"
                  onClick={() => setPendingDelete(scan.id)}
                  aria-label="Delete this scan"
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
