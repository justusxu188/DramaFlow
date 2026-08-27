# Workspace Context and Flow Isolation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every production action, status, error, and artifact visibly and logically bound to one project, workflow, run, stage, and artifact.

**Architecture:** Add pure workspace-context selectors before changing rendering. Use those selectors in a small workspace shell composed of context, stage navigation, and stage-scoped task feedback. Keep existing production commands and persisted data compatible while progressively extracting stage components from `batch-pipeline-panel.tsx`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, CSS.

---

### Task 1: Workspace context selectors

**Files:**
- Create: `src/lib/workspace-context.ts`
- Create: `src/lib/workspace-context.test.ts`
- Modify: `src/lib/pipeline-job-status.ts`

1. Add tests proving jobs are filtered by project, run, workflow entry, and stage.
2. Add tests proving a video-stage failure cannot appear in the script stage.
3. Implement `WorkspaceContext`, `jobsForWorkspace`, `jobsForWorkspaceStage`, and `workspaceStageSummary`.
4. Run the focused tests and typecheck.

### Task 2: Explicit workspace context

**Files:**
- Create: `src/components/workspace-context-bar.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/interactions.test.tsx`

1. Render project, workflow, run, stage, and current artifact context above stage content.
2. Show a stable short run identifier and run update time.
3. Distinguish workflow input from project-level source assets.
4. Add responsive tests and interaction assertions.

### Task 3: Stage-scoped navigation and feedback

**Files:**
- Create: `src/components/workflow-stage-navigation.tsx`
- Create: `src/components/stage-task-feedback.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/app/globals.css`

1. Move stage rendering and retry controls out of tab labels.
2. Display only the current stage error and retry action.
3. Keep a single primary action in the stage header.
4. Remove cross-stage error banners from stage content.

### Task 4: Script-stage density reduction

**Files:**
- Create: `src/components/script-workspace-list.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/app/globals.css`

1. Keep highlight navigation and script selection in a compact list.
2. Expand only one script detail at a time.
3. Preserve batch selection and per-script actions.
4. Mount video elements only for the active highlight/detail.

### Task 5: Project summary consistency

**Files:**
- Modify: `src/lib/project-store.ts`
- Modify: `src/lib/project-store.test.ts`

1. Calculate project status from the latest run per workflow instead of raw job kinds.
2. Do not report 100% when the active/latest workflow has failed or incomplete stages.
3. Keep project output counts based on verified completed compositions.

### Task 6: Regression verification

1. Run focused workspace and component tests.
2. Run all tests and TypeScript checks.
3. Run the production build.
4. Browser-test all four workflows at desktop and narrow viewport widths.
5. Verify no stage displays failures belonging to another stage or run.
