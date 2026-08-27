# Highlight Preroll Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep workflow status accurate, bind scripts visibly to the selected highlight batch, and make text-to-video prerolls inherit the highlight video's visual style.

**Architecture:** Normalize pipeline jobs to the latest task for each stage unit before computing failures, retries, and running counts. Treat production-plan highlight selection as the next batch input while the script workspace reads only immutable current-run highlights. Extend transition analysis with a structured visual-style reference and inject it into prompt compilation.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Ark multimodal analysis, Seedance prompt compilation.

---

### Task 1: Normalize stage task status

**Files:**
- Create: `src/lib/pipeline-job-status.ts`
- Create: `src/lib/pipeline-job-status.test.ts`
- Modify: `src/components/batch-pipeline-panel.tsx`

1. Add stage and task-unit classification helpers.
2. Keep only the latest task for each task unit.
3. Derive running and failed counts from the same normalized task set.
4. Render retry only when the latest effective task is failed.
5. Show running counts in script, preroll, and other active stage labels.

### Task 2: Separate next-run selection from current-run outputs

**Files:**
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/interactions.test.tsx`

1. Derive the current run's uploaded highlight asset IDs from persisted highlight artifacts.
2. Label plan selection as the next production batch input.
3. Warn when next-run selection differs from the current batch.
4. Label the script navigator and player as current-batch highlights.
5. Keep scripts filtered strictly by the active current-run highlight ID.

### Task 3: Analyze and apply highlight visual style

**Files:**
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/lib/providers/ark.ts`
- Modify: `src/lib/pipeline-runner.ts`
- Test: `src/lib/providers/providers.test.ts`

1. Extend `TransitionAnchor` with structured visual style fields.
2. Request character, wardrobe, prop, scene, lighting, color, camera, and texture style during highlight opening analysis.
3. Pass the style reference into video prompt compilation.
4. Add mandatory text-to-video style matching instructions to model input.
5. Include the style reference in deterministic fallback prompts.

### Task 4: Verify behavior

**Files:**
- Test: `src/components/interactions.test.tsx`
- Test: `src/lib/providers/providers.test.ts`
- Test: `src/lib/pipeline-runner.test.ts`

1. Verify a historical failure followed by success has no retry button.
2. Verify running counts appear in stage labels.
3. Verify current-batch and next-batch highlight mismatch is explicit.
4. Verify compiled prompts receive and preserve highlight style constraints.
5. Run focused tests, full tests, TypeScript checks, production build, and browser screenshots.
