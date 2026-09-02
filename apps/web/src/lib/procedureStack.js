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

// There is no count ceiling in this file any more, and the removal is the point of this note.
//
// It used to hold `MAX_PROCEDURES = 6`, described as matching the backend. It matched nothing: the
// backend constant said it matched the API, and the API's own validator accepts twelve. Git dates
// the six to three weeks before the clinical catalogue existed, when the only catalogue had
// exactly six regions and forbade two procedures in one region — so six selections was six
// regions, which was the whole catalogue. It was inherited from a shape this file no longer has.
//
// It was measured before it was deleted. All 72 supported procedures at intensity 5 move the worst
// landmark by 0.102 of face width, against a per-control ceiling of 0.115 and a measured folding
// point near 0.274, and the warp is solved once for the whole stack rather than once per item, so
// neither the picture nor the cost degrades as the count rises.
//
// What a large stack does break is honesty: doses that sum past the renderer's ceiling get clamped,
// and opposing procedures on a one-way control can cancel to nothing. Those are reported by the
// server as `dose_notes` and rendered by `lib/doseNotes.js` — that is what replaced the cap, and
// the cap is only safe to remove because they are on screen.
//
// The server keeps whatever ceiling it keeps and refuses what it refuses; the client no longer
// invents one of its own on top of it.

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
 * region's shape, two procedures coexist. Returns the same array when the item is locked.
 */
export function toggleProcedure(stack, id, level = DEFAULT_INTENSITY_LEVEL) {
  const existing = procedureItem(stack, id);
  if (existing) return existing.locked ? stack : stack.filter((item) => item.id !== id);
  return [...stack, { id, level, locked: false }];
}

/**
 * Add every one of these that is not already in, keeping the ones that are.
 *
 * For "select all in this category", which is worth offering only now: the largest category holds
 * sixteen procedures, so under the old ceiling the control could not have completed its own name.
 * Existing rows are left exactly as they are — a procedure already in at level 5 is not reset to
 * the default by a bulk add — and the array comes back unchanged when there is nothing to add, so
 * the caller can tell by identity that the picture on screen is still the selected one.
 */
export function addProcedures(stack, ids, level = DEFAULT_INTENSITY_LEVEL) {
  const missing = ids.filter((id) => !procedureItem(stack, id));
  if (missing.length === 0) return stack;
  return [...stack, ...missing.map((id) => ({ id, level, locked: false }))];
}

/** Drop every one of these that is in and unlocked. Unchanged, by identity, when none are. */
export function removeProcedures(stack, ids) {
  const dropping = new Set(ids.filter((id) => procedureItem(stack, id) && !isProcedureLocked(stack, id)));
  if (dropping.size === 0) return stack;
  return stack.filter((item) => !dropping.has(item.id));
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
