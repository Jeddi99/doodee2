---
name: grill-me
description: Relentless interview to sharpen a plan, architecture decision, or feature design for doodee-app. Stress-tests requirements and technical choices in structured Q&A rounds before writing code. Trigger on /grill-me, grill, interview me, stress-test plan.
---

# Grill-Me (Adapted for doodee-app)

Grill the user relentlessly about a plan, architectural decision, or new feature in `doodee-app`. Map decisions into a **design tree** and resolve them in structured rounds.

## Interview Process

1. **Rounds & Frontier:** Identify open architectural or UX decisions (React state management, monorepo placement `@doodee/shared` vs `@doodee/web`, Firebase/MediaPipe integration, performance requirements).
2. **Fact Finding:** Search the codebase (`apps/web`, `packages/shared`, `package.json`) using available tools before asking the user. Never ask the user for information that can be read from the filesystem.
3. **Format Questions:** Group independent frontier questions into numbered rounds with explicit recommendations.

```markdown
❓ **Q1** - **<Question Title>**: <Context & Options>

➡️ **Recommended:** <Your recommended option with rationale for doodee-app>
```

4. **Iterate:** Once the user answers, recompute the design tree frontier and present the next set of unblocked questions.
5. **Completion:** Stop when every decision is settled. Output a final agreed design plan before implementing.
