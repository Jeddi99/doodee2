---
name: karpathy-guidelines
description: Behavioral guidelines to reduce common LLM coding mistakes in doodee-app. Focuses on thinking before coding, simplicity, surgical changes, and goal-driven execution verified via oxlint and tests.
license: MIT
---

# Karpathy Guidelines (Adapted for doodee-app)

Behavioral guidelines derived from Andrej Karpathy's LLM coding observations, customized for `doodee-app` (Vite, React 19, monorepo).

## 1. Think Before Coding
- Explicitly state assumptions about `@doodee/web` and `@doodee/shared`.
- Surface trade-offs and alternative simpler approaches before changing code.
- If requirements are unclear, name the ambiguity and ask.

## 2. Simplicity First
- Minimum code to solve the problem. No speculative features or unused abstractions.
- Use existing hooks and `@doodee/shared` utilities.
- If a React component or utility can be written in 30 lines instead of 100, write 30 lines.

## 3. Surgical Changes
- Touch ONLY what is necessary.
- Do not refactor adjacent code, reformat CSS, or rewrite clean components unless requested.
- Remove orphaned imports or unused variables introduced by YOUR change.
- Respect the existing code style in `apps/web/src` and `packages/shared/src`.

## 4. Goal-Driven Execution & Empirical Verification
- Define clear success criteria for every task.
- Verify changes using `npm run lint` (`oxlint`) and `npm run test:web` (`node --test`).
- Never mark a task complete without empirical verification (linting, testing, or dev server checks).
