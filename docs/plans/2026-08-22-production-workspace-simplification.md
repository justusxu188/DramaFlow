# Production Workspace Simplification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify the production workspace, make stage state visually unambiguous, and align production-version behavior with material and configuration snapshots.

**Architecture:** Keep `runId` as the internal production-version boundary, but expose only one compact production-version summary. Make the stage navigation the primary workflow indicator. Continue operations reuse the active run; changed material or production settings create a new run.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, Tailwind/global CSS.

---

### Task 1: Lock the simplified workspace contract

**Files:**
- Modify: `src/components/interactions.test.tsx`
- Modify: `src/lib/start-intent.test.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/route.test.ts`

**Steps:**
1. Assert that duplicate project/workflow/stage/object context and total progress are absent.
2. Assert that the stage is named `生产设置`.
3. Assert that refresh and top-level export actions are absent.
4. Assert that the start action is rendered inside the production-settings stage.
5. Assert that continuing an unchanged production version keeps the existing `runId`.

### Task 2: Simplify workspace information hierarchy

**Files:**
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/components/pipeline-workspace.tsx`
- Modify: `src/components/pipeline-production-plan-stage.tsx`

**Steps:**
1. Remove `WorkspaceContextBar` and the total completion progress.
2. Keep one compact `生产版本 + 输入范围` summary.
3. Remove the manual refresh button.
4. Remove the top-level export button; final-output cards remain the export/download surface.
5. Remove the repeated selected-material duration summary from the settings stage.

### Task 3: Make stage state visually unambiguous

**Files:**
- Modify: `src/components/workflow-stage-navigation.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/lib/creative-work-types.ts`

**Steps:**
1. Rename the `plan` stage to `生产设置`.
2. Use muted green only for completed stage lines.
3. Use brand orange for the active stage line and background.
4. Keep waiting stages neutral.
5. Use red only for failed status text; do not color the stage line red.
6. Use amber only for running/attention status text.

### Task 4: Clarify starting and continuing production

**Files:**
- Modify: `src/lib/start-intent.ts`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/components/pipeline-production-plan-stage.tsx`

**Steps:**
1. Label changed-input/config execution as `开始新生产`.
2. Label unchanged active-version execution as `继续当前生产`.
3. Move the action beside the settings save action.
4. Keep confirmation when a new production version will be created.

### Task 5: Reuse the active production version

**Files:**
- Modify: `src/app/api/projects/[projectId]/workflow/continue-production-preflight.ts`

**Steps:**
1. Stop calling `startPipelineRunFromSharedArtifacts` for `continue_production`.
2. Reuse the workspace `currentRunId`.
3. Save and confirm settings on the same run.
4. Preserve new-run creation for `run_full`.

### Task 6: Verify

**Steps:**
1. Run targeted component, intent, and workflow route tests.
2. Run `npm run typecheck`.
3. Run `npm test`.
4. Run `npm run build`.
5. Verify desktop and narrow browser layouts.
