import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pollDelay, isSettled, MAX_POLLS, SETTLED_STATUSES } from './poll-schedule.ts';

test('the first asks are fast, then the interval backs off and caps', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(pollDelay), [1500, 1500, 2500, 4000, 6000]);
  assert.equal(pollDelay(5), 6000, 'capped rather than growing without bound');
  assert.equal(pollDelay(500), 6000);
});

test('reaching the ceiling takes less time than an analysis run', () => {
  const elapsed = [0, 1, 2, 3].reduce((sum, tick) => sum + pollDelay(tick), 0);
  assert.equal(elapsed, 9500, 'a scan runs longer than this, so the ramp never outpaces the job');
});

test('a nonsense tick still returns a usable delay rather than NaN', () => {
  for (const tick of [-1, NaN, Infinity]) {
    assert.equal(pollDelay(tick), 1500);
  }
});

test('isSettled recognises every terminal status and nothing else', () => {
  for (const status of SETTLED_STATUSES) assert.equal(isSettled(status), true);
  for (const status of ['queued', 'processing', 'uploading', '', undefined, null, 3]) {
    assert.equal(isSettled(status), false, `${String(status)} is not terminal`);
  }
});

test('the poll ceiling outlasts the Celery task time limit', () => {
  // CELERY_TASK_TIME_LIMIT is 180 s, so a job that is merely slow must not be abandoned.
  const total = Array.from({ length: MAX_POLLS }, (_, i) => pollDelay(i)).reduce((a, b) => a + b, 0);
  assert.ok(total > 180_000, `ceiling is ${total} ms, must exceed the 180 s task limit`);
  assert.ok(total < 600_000, 'but it must give up eventually rather than spinning forever');
});

test('pollUntilSettled returns as soon as the job is already done', async () => {
  const { pollUntilSettled } = await import('./poll-schedule.ts');
  let fetches = 0;
  const result = await pollUntilSettled({ status: 'completed' }, async () => { fetches += 1; return { status: 'completed' }; }, { sleep: async () => {} });
  assert.equal(result.status, 'completed');
  assert.equal(fetches, 0, 'an already-settled job must not be re-fetched');
});

test('pollUntilSettled follows the backoff schedule and reports each update', async () => {
  const { pollUntilSettled } = await import('./poll-schedule.ts');
  const delays: number[] = [];
  const seen: string[] = [];
  const statuses = ['processing', 'processing', 'completed'];
  let i = 0;
  const result = await pollUntilSettled(
    { status: 'queued' },
    async () => ({ status: statuses[i++] }),
    { sleep: async (ms) => { delays.push(ms); }, onUpdate: (v) => seen.push(v.status!) },
  );
  assert.equal(result.status, 'completed');
  assert.deepEqual(delays, [1500, 1500, 2500], 'delays follow the shared schedule');
  assert.deepEqual(seen, ['processing', 'processing', 'completed'], 'the caller sees every update');
});

test('pollUntilSettled gives up rather than looping forever on a dead worker', async () => {
  const { pollUntilSettled, PollTimeout } = await import('./poll-schedule.ts');
  let fetches = 0;
  await assert.rejects(
    () => pollUntilSettled(
      { status: 'queued' },
      async () => { fetches += 1; return { status: 'queued' }; },
      { sleep: async () => {}, maxPolls: 5 },
    ),
    (err: Error) => err instanceof PollTimeout && /did not settle after 5 polls/.test(err.message),
  );
  assert.equal(fetches, 5, 'it stops at the ceiling instead of asking forever');
});

test('pollUntilSettled surfaces a failed job as a normal return, not a throw', async () => {
  const { pollUntilSettled } = await import('./poll-schedule.ts');
  const result = await pollUntilSettled({ status: 'queued' }, async () => ({ status: 'failed' }), { sleep: async () => {} });
  assert.equal(result.status, 'failed', 'callers branch on failed themselves to read error_message');
});
