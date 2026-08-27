# Pipeline Layout And Script Delete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Compress the project workspace hierarchy, remove duplicate controls, add persistent draft-script deletion, and consistently name the generated asset stage "AI 前贴视频".

**Architecture:** Keep project-level actions in `PipelineWorkspace`, source preparation in a compact band directly below the top bar, and production status/navigation in `BatchPipelinePanel`. Add a `delete_script` workflow action backed by the existing atomic pipeline store so JSON and MySQL persistence remain synchronized.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Vitest, Testing Library, Prisma/MySQL persistence adapter.

---

### Task 1: Lock The New UI Contract With Tests

**Files:**
- Modify: `src/components/interactions.test.tsx`
- Modify: `src/app/api/projects/[projectId]/workflow/route.test.ts`

**Steps:**
1. Assert the project header no longer exposes `整片预览`.
2. Assert the duplicate bottom `项目素材` region is absent.
3. Assert the production stage is named `AI 前贴视频`.
4. Assert a draft script exposes `删除脚本` and submits `delete_script`.
5. Assert the API delegates `delete_script` to the pipeline store.
6. Run the focused tests and confirm they fail before implementation.

### Task 2: Add Persistent Draft-Script Deletion

**Files:**
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`
- Modify: `src/components/batch-pipeline-panel.tsx`

**Steps:**
1. Add `deleteScript(projectId, scriptId)` to remove only draft scripts.
2. Synchronize the current immutable run after deletion.
3. Add the validated `delete_script` workflow action.
4. Add a destructive icon button with confirmation and pending state.
5. Remove deleted IDs from local selection and refresh persisted data.
6. Run route and interaction tests.

### Task 3: Compress Workspace And Remove Duplicate Controls

**Files:**
- Modify: `src/components/pipeline-workspace.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/app/globals.css`

**Steps:**
1. Remove `整片预览` from the project top bar.
2. Reduce the source area to one-line source status plus upload/manage action.
3. Remove the duplicate bottom project-material strip.
4. Reduce the pipeline heading to a compact title row.
5. Keep stage navigation and progress together as a distinct status region.
6. Keep only refresh and formal-production controls in that region.
7. Update responsive styles.

### Task 4: Normalize Naming And Verify

**Files:**
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/components/interactions.test.tsx`

**Steps:**
1. Replace stage and status labels `AI 前贴` with `AI 前贴视频`.
2. Run focused component and route tests.
3. Run the full Vitest suite.
4. Run TypeScript checking.
5. Run the Next.js production build.
6. Open the existing local project page and inspect browser errors.
