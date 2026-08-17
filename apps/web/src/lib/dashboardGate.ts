/**
 * What an image-backed dashboard view should render for a given scan.
 *
 * This exists as its own function because the rule was wrong for a long time in a way that was
 * invisible in review: the gate used to be "no photo yet, so keep waiting". That is only true
 * while Celery is still working. Thirty days after a scan, `purge_scan_images`
 * (backend/doodee/tasks.py:118) deletes the photographs and empties `image_objects` while
 * keeping the row and every measurement on it — so "completed, no photo" is the permanent
 * steady state of every account, and treating it as "still loading" turned Overview, Analysis,
 * Plan and Simulate into a blank page forever.
 *
 * The decision therefore depends on `status` alone. Whether a photograph is available is a
 * question for the components that draw one (see ScanPhoto), never for whether the page renders.
 */
export type DashboardGate = "waiting" | "failed" | "ready";

const SETTLED = new Set(["completed", "failed"]);

export function dashboardGate(scan: { status?: string } | null | undefined): DashboardGate {
  if (!scan || !scan.status) return "waiting";
  if (scan.status === "failed") return "failed";
  // queued / processing / deletion_pending are all still in flight from the client's side.
  return SETTLED.has(scan.status) ? "ready" : "waiting";
}
