# Duration-First Production Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unlock global highlight parameters from selected source durations immediately, and start storyline analysis only after the user confirms parameters and starts production.

**Architecture:** Read duration metadata in the browser before source upload and persist `durationMs` with each asset. Probe and backfill legacy assets from their existing source URLs. The production panel derives total duration from the selected asset snapshot, calculates bounded recommendations locally, and submits one `run_full` workflow request that starts storyline analysis and then continues through the existing pipeline.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zod, Prisma/MySQL with JSON fallback, Vitest, Testing Library.

---

### Task 1: Persist source duration

**Files:**
- Modify: `src/lib/domain.ts`
- Modify: `src/lib/project-store.ts`
- Modify: `src/app/api/projects/[projectId]/assets/route.ts`
- Modify: `src/components/source-upload.tsx`
- Test: `src/lib/domain.test.ts`

**Steps:**
1. Add required positive `durationMs` validation to new source asset input.
2. Add `durationMs` to `SourceAsset` and both MySQL/local mappings.
3. Read each local file duration through an HTML video metadata probe before upload.
4. Include the duration in asset registration.
5. Run domain and interaction tests.

### Task 2: Backfill legacy source durations

**Files:**
- Modify: `src/lib/project-store.ts`
- Modify: `src/app/api/projects/[projectId]/assets/route.ts`
- Modify: `src/components/pipeline-workspace.tsx`
- Test: `src/components/interactions.test.tsx`

**Steps:**
1. Add a PATCH endpoint for updating one project asset duration.
2. Probe source URLs for assets without a valid duration.
3. Persist successful probes and refresh the project.
4. Expose a visible “reading duration” state while metadata is incomplete.

### Task 3: Calculate highlight settings before AI analysis

**Files:**
- Modify: `src/lib/production-config.ts`
- Modify: `src/lib/production-config.test.ts`
- Modify: `src/components/pipeline-workspace.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Test: `src/components/interactions.test.tsx`

**Steps:**
1. Correct the official count upper-limit formula to use content-type minimum duration.
2. Pass selected asset duration to the production panel.
3. Calculate recommendations from selected duration without pipeline analysis.
4. Enable the master input as soon as all selected durations are available.
5. Remove analysis-snapshot gating from parameter controls.

### Task 4: Start the full workflow only after confirmation

**Files:**
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`
- Test: `src/components/interactions.test.tsx`

**Steps:**
1. Submit `run_full` from the primary action.
2. Label the action “正式开始生产”.
3. Keep storyline analysis as the first asynchronous stage with `autoRun: true`.
4. Preserve script review before Seedance.
5. Reject production if selected assets have missing duration metadata.

### Task 5: Verify

**Steps:**
1. Run `npm run typecheck`.
2. Run `npm test -- --run`.
3. Run `npm run build`.
4. Verify `/production` and the project detail page return HTTP 200.
