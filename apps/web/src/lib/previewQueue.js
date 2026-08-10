// Selecting a preset renders it straight away, so selections arrive faster than the server
// answers. Two rules keep that honest:
//
//   1. Never two requests at once. The backend holds a per-user lock for the duration of a
//      preview and answers a second one with 409, so overlapping requests just lose data.
//   2. Only the newest selection may paint. A slower earlier request must not overwrite the
//      image for the preset the user is looking at now.

/** Nothing requested, nothing in flight. */
export const emptyQueue = () => ({ inFlight: null, pending: null, sequence: 0 });

/**
 * Record a new selection.
 *
 * Returns the next state and whether the caller should start a request now. While one is in
 * flight the selection is only remembered — `settle` starts it once the road is clear.
 */
export function request(state, selection) {
  if (state.inFlight) return { state: { ...state, pending: selection }, start: null };
  const sequence = state.sequence + 1;
  return {
    state: { ...state, sequence, inFlight: { selection, sequence }, pending: null },
    start: { selection, sequence },
  };
}

/**
 * A request finished. Returns the next state, whether its result may be painted, and the
 * request to start next.
 */
export function settle(state, sequence) {
  const isCurrent = state.inFlight?.sequence === sequence;
  // A response for a request we already superseded is stale: keep waiting for the current one.
  if (!isCurrent) return { state, accept: false, start: null };
  if (!state.pending) return { state: { ...state, inFlight: null }, accept: true, start: null };
  const next = state.sequence + 1;
  return {
    state: { ...state, inFlight: { selection: state.pending, sequence: next }, pending: null, sequence: next },
    accept: true,
    start: { selection: state.pending, sequence: next },
  };
}

/** True when a request is running or one is waiting behind it. */
export const isBusy = (state) => Boolean(state.inFlight || state.pending);
