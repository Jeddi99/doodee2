// Which picture belongs to which selection, and what has been asked for since it was made.
//
// Two facts about the simulation screen force everything below:
//
//   1. A render is a paid call, so ticking a procedure no longer starts one. The user builds the
//      whole selection and presses Create once. That means there is now a state this screen never
//      had — a picture on screen that is *not* what is currently selected — and it has to be
//      visible rather than inferred. Nothing else in the design is load-bearing next to this.
//   2. A render belongs to a stack *and* to a camera angle. The map it replaces was keyed by angle
//      alone, so re-rendering the front left the previous stack's left profile sitting in the map,
//      and the angle tab — finding a picture already there — never asked for a new one. The two
//      tabs then showed two different selections and neither of them said so.
//
// So a render is stored under both, and `renderFor` hands one back only for the exact pair it was
// stored under. A picture of a different stack can still be shown, because a user changing their
// selection wants to see what they are changing *from*, but only through `shownRender`, which
// returns `stale: true` when it does that and leaves the caller no way to display it silently.
//
// Keeping the map instead of clearing it is also the second saving: re-ticking a procedure that
// was rendered a minute ago restores that exact image with no request, because the key matches
// again. The map is only ever thrown away when its contents stop meaning anything — another scan,
// another mode, consent withdrawn.

/**
 * The identity of a stack, as far as the renderer is concerned.
 *
 * The lock flag is left out on purpose: locking guards a selection from being edited, it does not
 * change a pixel, so a locked and an unlocked stack of the same procedures are the same picture.
 *
 * Order is kept in, and that is the conservative choice rather than the clever one. Two stacks
 * holding the same procedures in a different order are probably the same image — the warp is
 * solved over the whole stack — but "probably" is the wrong standard for deciding that an existing
 * picture may be presented as the answer to a new question. Being order-sensitive can cost one
 * extra render; being order-blind could show the wrong image, and only one of those is a bug.
 */
export const stackFingerprint = (stack) => stack.map((item) => `${item.id}@${item.level}`).join('+');

/** Angle first, so a key is readable in a debugger and can never collide with a procedure id. */
export const renderKey = (fingerprint, view) => `${view}|${fingerprint}`;

/** No renders yet. `at` is a counter, not a clock: two renders in one millisecond must still order. */
export const emptyRenders = () => ({ at: 0, byKey: {} });

/**
 * Remember a finished render, together with the stack that produced it.
 *
 * The stack is stored beside the result rather than derived back out of the fingerprint, because
 * the screen has to name what changed since — "you have added a chin implant and removed the lip
 * filler" needs the old rows, not a hash of them.
 */
export function storeRender(renders, { fingerprint, view, stack, result }) {
  const at = renders.at + 1;
  return {
    at,
    byKey: { ...renders.byKey, [renderKey(fingerprint, view)]: { fingerprint, view, stack, result, at } },
  };
}

/** The render for exactly this stack at exactly this angle, or null. Never a near miss. */
export const renderFor = (renders, fingerprint, view) => renders.byKey[renderKey(fingerprint, view)] || null;

/** Whether this exact stack has been rendered at any angle, which is how "already asked for" is known. */
export const stackRendered = (renders, fingerprint) => Object
  .values(renders.byKey).some((entry) => entry.fingerprint === fingerprint);

/**
 * The most recent render at this angle, whatever stack it was of.
 *
 * Deliberately scoped to the one angle. Falling back across angles would put the front render
 * under the Left tab, and a mislabelled angle is the same class of lie as a mislabelled stack.
 */
export function lastRenderForView(renders, view) {
  return Object.values(renders.byKey).reduce(
    (best, entry) => (entry.view === view && (!best || entry.at > best.at) ? entry : best),
    null,
  );
}

/**
 * What to put on screen for this stack at this angle, and whether it is the answer to the question
 * being asked.
 *
 * `stale: true` is not a failure state — it is the ordinary state between ticking a box and
 * pressing Create, and the caller is expected to say so on screen next to the picture.
 */
export function shownRender(renders, fingerprint, view) {
  const exact = renderFor(renders, fingerprint, view);
  if (exact) return { entry: exact, stale: false };
  const previous = lastRenderForView(renders, view);
  return { entry: previous, stale: Boolean(previous) };
}

/**
 * The difference between the stack in the picture and the stack the user has now.
 *
 * Reported per item rather than as a count, because "3 changes" tells somebody nothing they can
 * act on, and the whole reason this exists is so the sentence beside a stale image can be specific.
 */
export function pendingChanges(shownStack, stack) {
  const before = new Map((shownStack || []).map((item) => [item.id, item]));
  const after = new Map((stack || []).map((item) => [item.id, item]));
  return {
    added: (stack || []).filter((item) => !before.has(item.id)),
    removed: (shownStack || []).filter((item) => !after.has(item.id)),
    relevelled: (stack || [])
      .filter((item) => before.has(item.id) && before.get(item.id).level !== item.level)
      .map((item) => ({ id: item.id, from: before.get(item.id).level, to: item.level })),
  };
}

export const noChanges = () => ({ added: [], removed: [], relevelled: [] });

export const changeCount = (changes) => changes.added.length + changes.removed.length + changes.relevelled.length;

/**
 * How each selected row stands against the picture: `in` it, `added` since, or `relevelled` since.
 *
 * The level is carried rather than only the id, because moving a procedure from level 2 to level 5
 * leaves it in the stack and out of the image, and a row marked simply "chosen" would be hiding
 * exactly the change the user just made.
 */
export function rowStandings(entry, stack) {
  const shown = new Map((entry?.stack || []).map((item) => [item.id, item.level]));
  return new Map((stack || []).map((item) => [
    item.id,
    !shown.has(item.id) ? 'added' : shown.get(item.id) !== item.level ? 'relevelled' : 'in',
  ]));
}
