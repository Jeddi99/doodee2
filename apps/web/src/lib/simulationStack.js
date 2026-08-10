// What the viewer is currently simulating: several regions at once, per camera angle.
//
// Two things this file exists to guarantee:
//
//   1. Changing region never drops what is already selected. Selections accumulate until the
//      user removes them, so a jaw shape survives a trip to the chin tab and back.
//   2. A locked item cannot be replaced or removed. Locking is how the user says "this one is
//      settled, now let me try the rest" — so every mutation below returns the state object
//      *unchanged* when it would touch a locked item, and the caller can compare by identity
//      to know nothing happened (and skip both the re-render and the render request).
//
// Front and side are separate stacks because they are separate source photos: one render
// cannot hold both.

/** Nothing selected in either angle. */
export const emptyStack = () => ({ front: [], profile: [] });

/** One shape per region, so this is also the region ceiling. */
export const MAX_ITEMS = 6;

export const itemFor = (stack, view, region) => stack[view].find((item) => item.region === region);
export const isLocked = (stack, view, region) => Boolean(itemFor(stack, view, region)?.locked);
export const count = (stack, view) => stack[view].length;
export const total = (stack) => stack.front.length + stack.profile.length;

const withView = (stack, view, items) => ({ ...stack, [view]: items });

/**
 * Choose a shape for a region, replacing whatever that region held.
 *
 * Returns the same state when the region is locked, or when the stack is full and this would
 * add a seventh region.
 */
export function select(stack, view, region, presetId) {
  const existing = itemFor(stack, view, region);
  if (existing?.locked) return stack;
  if (existing) {
    if (existing.presetId === presetId) return stack;
    return withView(stack, view, stack[view].map((item) => (item.region === region ? { ...item, presetId } : item)));
  }
  if (stack[view].length >= MAX_ITEMS) return stack;
  return withView(stack, view, [...stack[view], { region, presetId, locked: false }]);
}

export function toggleLock(stack, view, region) {
  if (!itemFor(stack, view, region)) return stack;
  return withView(stack, view, stack[view].map((item) => (item.region === region ? { ...item, locked: !item.locked } : item)));
}

/** Drop a region. Returns the same state when it is locked or absent. */
export function remove(stack, view, region) {
  const existing = itemFor(stack, view, region);
  if (!existing || existing.locked) return stack;
  return withView(stack, view, stack[view].filter((item) => item.region !== region));
}

/** Clear one angle, keeping whatever is locked. */
export function clearUnlocked(stack, view) {
  const kept = stack[view].filter((item) => item.locked);
  if (kept.length === stack[view].length) return stack;
  return withView(stack, view, kept);
}

/**
 * Clear everything in both angles, locked items included.
 *
 * For the cases where the stack stops meaning anything — a different scan, or the reference
 * mode which cannot stack — rather than for anything the user does to one item.
 */
export const clearAll = () => emptyStack();

/** Force a region unlocked so a rejected item can be taken back out. */
export function unlock(stack, view, region) {
  return isLocked(stack, view, region) ? toggleLock(stack, view, region) : stack;
}

/** The stack as the API wants it, in the order the user built it. */
export const toRequest = (stack, view) => stack[view].map(({ region, presetId }) => ({ region, preset_id: presetId }));
