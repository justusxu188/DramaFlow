# Two-Stage Preroll Prompts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split preroll creation into configurable creative-proposal and final-script stages, with current-run deduplication and focused model inputs.

**Architecture:** Persist two System Prompts in creative settings and snapshot both into production jobs. Ark first generates structured creative proposals from the active story arc, necessary evidence, transition anchor, style, relationship mode, and current-run creative fingerprints; it then expands accepted proposals into final scripts. Program-owned JSON contracts and validation remain outside the editable prompts.

**Tech Stack:** Next.js App Router, React, TypeScript, Zod, Ark chat completions, Vitest.

---

### Task 1: Persist two configurable prompts

**Files:**
- Create: `src/lib/preroll-prompts.ts`
- Modify: `src/lib/creative-settings-store.ts`
- Modify: `src/app/api/settings/creative/route.ts`
- Modify: `src/components/creative-settings-form.tsx`
- Test: `src/app/api/settings/creative/route.test.ts`

**Steps:**
1. Add failing API tests for both prompt fields.
2. Define production-ready default prompts for proposal and final-script stages.
3. Normalize old settings and preserve the legacy prompt as the final-script fallback.
4. Render two labeled textareas and reset them to the new defaults.
5. Run settings API and component tests.

### Task 2: Snapshot only relevant prompt configuration

**Files:**
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`
- Modify: `src/lib/pipeline-runner.ts`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`
- Test: `src/lib/pipeline-runner.test.ts`

**Steps:**
1. Add failing assertions for both prompt snapshots.
2. Pass both prompts into initial and regenerated script jobs.
3. Keep production configuration persistence unchanged.
4. Run workflow tests.

### Task 3: Implement proposal-first script generation

**Files:**
- Modify: `src/lib/providers/ark.ts`
- Test: `src/lib/providers/providers.test.ts`

**Steps:**
1. Add tests proving the first call uses the proposal prompt and the second uses the script prompt.
2. Define and validate a compact creative proposal schema.
3. Generate proposals using only story arc, relevant evidence, transition anchor, style, relationship mode, and current-run fingerprints.
4. Reject duplicate proposal fingerprints within the request and against current-run scripts.
5. Expand accepted proposals into final scripts using the final-script prompt.
6. Keep structural and similarity correction as an optional final-script retry.
7. Run provider tests.

### Task 4: Use current-run-wide deduplication

**Files:**
- Modify: `src/lib/pipeline-runner.ts`
- Test: `src/lib/pipeline-runner.test.ts`

**Steps:**
1. Add a failing test showing scripts from other highlights are included.
2. Pass all current-run scripts as compact fingerprints.
3. Verify regenerated scripts avoid deleted and existing concepts where records remain available.
4. Run runner tests.

### Task 5: Persist defaults and verify

**Files:**
- Modify through API: `data/creative-settings.json`

**Steps:**
1. Save the two new default prompts through the real settings API.
2. Run focused tests, full tests, TypeScript, and production build.
3. Verify the settings API returns both persisted prompts.
