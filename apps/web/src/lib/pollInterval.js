/**
 * react-query's `refetchInterval` for the two status-polled resources: a scan and a saved
 * simulation.
 *
 * The schedule itself lives in `@doodee/shared/poll-schedule` because mobile polls the same
 * endpoints through an await loop and the two must not drift apart. This module is only the
 * adapter from that schedule to react-query's callback shape.
 */
// The subpath rather than the package root: `@doodee/shared`'s index.ts uses extensionless
// relative imports, which Vite resolves and `node --test` does not, so importing the barrel here
// would make this module impossible to unit-test.
import { isSettled, pollDelay } from '@doodee/shared/poll-schedule';

export { pollDelay } from '@doodee/shared/poll-schedule';

/**
 * `false` once the job settles, otherwise the backed-off delay.
 *
 * `enabled` decides whether to poll at all. Pass the routes that actually display progress: the
 * dashboard shell holds this query for every panel that reads a finished scan, so without the
 * flag a user reading their receipts polls a progress bar they cannot see, on every route.
 */
export function statusPollInterval(query, enabled = true) {
  if (!enabled) return false;
  if (isSettled(query?.state?.data?.status)) return false;
  return pollDelay(query?.state?.dataUpdateCount ?? 0);
}
