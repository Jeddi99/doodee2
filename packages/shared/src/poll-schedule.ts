/**
 * How often to ask a Celery-backed job whether it has finished, and when to stop asking.
 *
 * A flat 1500 ms was costing more than it bought. Analysis takes ten to twenty seconds, so a
 * fixed 1.5 s interval spends most of its requests being told "still processing" — and every one
 * of those competes for the same worker slots the analysis itself needs. Polling faster than the
 * work completes does not make it complete sooner; under load it makes it slower.
 *
 * The first two asks stay fast, because a demo or cached scan really can settle immediately, and
 * then the interval backs off to six seconds. Reaching the ceiling takes 9.5 s of a job that runs
 * for at least twice that.
 *
 * Shared rather than duplicated: web polls through react-query's `refetchInterval` and mobile
 * through an await loop, but a schedule that lives in two files is a schedule that drifts.
 */

/** Milliseconds between polls, by how many results we have already received. */
const STEPS = [1500, 1500, 2500, 4000, 6000];

/** The statuses that mean the job is over, in either direction. */
export const SETTLED_STATUSES = ['completed', 'failed', 'cancelled'];

export function isSettled(status: unknown): boolean {
  return typeof status === 'string' && SETTLED_STATUSES.includes(status);
}

export function pollDelay(tick: number): number {
  if (!Number.isFinite(tick) || tick < 0) return STEPS[0];
  return STEPS[Math.min(Math.floor(tick), STEPS.length - 1)];
}

/**
 * The point at which a job that has not settled is not going to. Without a ceiling a dead Celery
 * worker leaves the client asking forever — on mobile that is a `while` loop that never returns,
 * so the spinner spins until the user force-quits.
 *
 * Generous on purpose: 40 polls on the schedule above is about four minutes, well past the 180 s
 * `CELERY_TASK_TIME_LIMIT`, so a job that is merely slow is never abandoned early.
 */
export const MAX_POLLS = 40;

export class PollTimeout extends Error {
  constructor(polls: number) {
    super(`Job did not settle after ${polls} polls`);
    this.name = 'PollTimeout';
  }
}

/**
 * Await a job to reach a terminal status, on the schedule above.
 *
 * For callers that poll in a loop rather than through react-query — mobile's scan and simulation
 * screens. `initial` is the response that created the job, so the first fetch happens only after
 * a delay rather than immediately re-asking something we were just told.
 *
 * `sleep` is injectable so the schedule can be tested without waiting minutes.
 *
 * Throws `PollTimeout` past `MAX_POLLS`. That ceiling is the point: both mobile loops were
 * `while (!settled)` with no bound, so a dead Celery worker left the spinner turning until the
 * user force-quit the app. A thrown error at least reaches the existing catch and shows a message.
 */
export async function pollUntilSettled<T extends { status?: string }>(
  initial: T,
  fetchOnce: () => Promise<T>,
  options: {
    onUpdate?: (value: T) => void;
    sleep?: (ms: number) => Promise<void>;
    maxPolls?: number;
  } = {},
): Promise<T> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const maxPolls = options.maxPolls ?? MAX_POLLS;
  let current = initial;
  for (let tick = 0; tick < maxPolls; tick += 1) {
    if (isSettled(current.status)) return current;
    await sleep(pollDelay(tick));
    current = await fetchOnce();
    options.onUpdate?.(current);
  }
  if (isSettled(current.status)) return current;
  throw new PollTimeout(maxPolls);
}
