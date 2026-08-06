---
name: scrutinize
description: Outsider-perspective end-to-end review of a plan, PR, or code change in doodee-app. Questions intent and whether a simpler approach would work, then traces actual code paths (React components, hooks, shared packages, build/Docker) to verify claims. Trigger on /scrutinize, review, audit, sanity-check, or second opinion on code/plans.
---

# Scrutinize (Adapted for doodee-app)

Stand outside the change and ask whether it should exist at all, then verify it actually does what it claims end-to-end in the `doodee-app` monorepo.

## Operating Stance
- **Outsider:** Read the artifact/diff cold without bias.
- **End-to-End Tracing:** Trace execution paths across `@doodee/web` components, React Router routes, TanStack Query hooks, Firebase/MediaPipe flows, and Docker configs.
- **Actionable & Concise:** Cite exact `file:line` references with clear rationale.

## Workflow

### 1. Intent Check
- State the goal in one sentence.
- Ask: Is there a simpler, smaller, or native way to achieve this in React 19 / Vite / `@doodee/shared`?

### 2. Trace Code Paths
- Entry point (Route / Component) → State / Hook → API / MediaPipe / Firebase → Render / DOM / Side-effect.
- Include unchanged code on both sides of the diff. Check for hidden memory leaks (e.g. MediaPipe listeners, canvas contexts, uncleaned event listeners).

### 3. Verification
- Does the code path actually produce the claimed behavior?
- What edge cases (empty states, missing Firebase auth, MediaPipe load failure, network failure) break it?
- How is it tested? Check against `npm run test:web` or `oxlint` rules.

### 4. Report
Output findings by severity (Blocker → Major → Nit):
- **Finding:** `file:line` - description
- **Why it matters:** Consequence (performance degradation, re-render loop, build error, broken UX)
- **Evidence:** Traced path / edge case
- **Suggested change:** Minimal fix

Close with a 1-line verdict: `ship / fix-then-ship / rework / reject`.
