export function homeScanState(scan, now = Date.now()) {
  if (!scan) return 'empty';
  if (new Date(scan.expires_at).getTime() <= now) return 'expired';
  if (scan.status === 'failed') return 'failed';
  if (scan.status === 'queued' || scan.status === 'processing') return 'processing';
  return scan.status === 'completed' ? 'completed' : 'empty';
}
