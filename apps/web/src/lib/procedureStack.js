// What the viewer is currently simulating from the clinical catalog.
//
// Deliberately not `simulationStack`. That one keys items by region and keeps a separate stack
// per camera angle, and both of those follow from the renderer it was written for: the legacy
// engine warps one photograph, and one region cannot hold two shapes at once.
//
// A catalog procedure is a pipeline the fused engine runs across all three views from a single
// model, so:
//
//   1. There is one stack, not one per angle. The angle chooses which of the three renders comes
//      back as the image; it does not change what is being simulated.
//   2. It is keyed by the procedure, not the region. Two procedures in the same region is an
//      ordinary thing to ask for — a bridge and a tip are both the nose — where two shapes for
//      one region never was.
//
// Locking carries over unchanged, and for the same reason: it is how the user says "this one is
// settled, now let me try the rest", so every mutation returns the array *unchanged* when it
// would touch a locked item, and the caller compares by identity to know nothing happened.

/** Matches `MAX_SELECTIONS` in the backend. A seventh is refused there, so it is refused here. */
export const MAX_PROCEDURES = 6;

/** The middle of the catalog's five levels, which is also what the backend assumes. */
export const DEFAULT_INTENSITY_LEVEL = 3;

export const emptyProcedureStack = () => [];

export const procedureItem = (stack, id) => stack.find((item) => item.id === id);
export const isProcedureLocked = (stack, id) => Boolean(procedureItem(stack, id)?.locked);
export const procedureCount = (stack) => stack.length;

/**
 * Add a procedure, or take it back out if it is already in.
 *
 * A catalog card is a toggle rather than a radio button because nothing replaces it: unlike a
 * region's shape, two procedures coexist. Returns the same array when the item is locked, or
 * when the stack is full and this would add a seventh.
 */
export function toggleProcedure(stack, id, level = DEFAULT_INTENSITY_LEVEL) {
  const existing = procedureItem(stack, id);
  if (existing) return existing.locked ? stack : stack.filter((item) => item.id !== id);
  if (stack.length >= MAX_PROCEDURES) return stack;
  return [...stack, { id, level, locked: false }];
}

/** Move one procedure's intensity. Returns the same array when it is locked or absent. */
export function setProcedureIntensity(stack, id, level) {
  const existing = procedureItem(stack, id);
  if (!existing || existing.locked || existing.level === level) return stack;
  return stack.map((item) => (item.id === id ? { ...item, level } : item));
}

export function toggleProcedureLock(stack, id) {
  if (!procedureItem(stack, id)) return stack;
  return stack.map((item) => (item.id === id ? { ...item, locked: !item.locked } : item));
}

/** Drop a procedure. Returns the same array when it is locked or absent. */
export function removeProcedure(stack, id) {
  const existing = procedureItem(stack, id);
  if (!existing || existing.locked) return stack;
  return stack.filter((item) => item.id !== id);
}

/** Clear the stack, keeping whatever is locked. */
export function clearUnlockedProcedures(stack) {
  const kept = stack.filter((item) => item.locked);
  return kept.length === stack.length ? stack : kept;
}

/** Force one unlocked so a procedure the server rejected can be taken back out. */
export function unlockProcedure(stack, id) {
  return isProcedureLocked(stack, id) ? toggleProcedureLock(stack, id) : stack;
}

/** The stack as the API wants it, in the order the user built it. */
export const toProcedureRequest = (stack) => stack.map(({ id, level }) => ({
  procedure_id: id, intensity_level: level,
}));
