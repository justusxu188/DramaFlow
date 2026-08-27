# Source Video Selection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to choose which uploaded source videos enter剧情理解、高光剪辑及后续生产，with unselected videos excluded from every provider request.

**Architecture:** Keep the current selection in `PipelineWorkspace`, defaulting newly loaded assets to selected. Pass selected asset IDs to `BatchPipelinePanel`; the workflow API validates project ownership and stores both asset IDs and resolved video URLs in the analysis job. Every downstream highlight job inherits the immutable video URL snapshot.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zod, Vitest, Testing Library.

---

### Task 1: Add interaction coverage

**Files:**
- Modify: `src/components/interactions.test.tsx`

**Steps:**
1. Add two real source assets to the project fixture.
2. Open the source library and deselect one video.
3. Start the workflow and assert the request contains only the selected asset ID.
4. Verify the start action is disabled when no source video is selected.
5. Run `npm test -- --run` and confirm the new assertions fail before implementation.

### Task 2: Implement source selection UI

**Files:**
- Modify: `src/components/pipeline-workspace.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/app/globals.css`

**Steps:**
1. Add `selectedAssetIds` state in `PipelineWorkspace`.
2. Select all assets on initial load and automatically select newly uploaded assets without restoring manually removed selections.
3. Replace source rows with checkbox labels while keeping the external preview action separate.
4. Add “select all”, “clear”, and selected-count controls.
5. Pass selected IDs and total source count into the production panel.
6. Disable production when no video is selected and show a concise reason.

### Task 3: Validate and snapshot selected sources

**Files:**
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`

**Steps:**
1. Extend `run_full` and `analyze_only` request schemas with 1–30 asset IDs.
2. Reject unknown or cross-project IDs.
3. Preserve project asset order when resolving selected IDs.
4. Enqueue the analysis job with `sourceAssetIds` and `videoUrls`.

### Task 4: Propagate the immutable source snapshot

**Files:**
- Modify: `src/lib/pipeline-runner.ts`

**Steps:**
1. Make analysis use the job’s snapshotted URLs, with all-project fallback only for legacy jobs.
2. Pass the same URLs from analysis to arc mining.
3. Pass them from arc mining to every highlight job.
4. Make highlight generation use only the inherited URLs.
5. Fail explicitly if a job has no selected source.

### Task 5: Verify delivery

**Steps:**
1. Run `npm run typecheck`.
2. Run `npm test -- --run`.
3. Run `npm run build`.
4. Verify the project page returns HTTP 200.
5. Confirm the existing Next.js server and Worker remain running.
