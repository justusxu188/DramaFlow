# Background Preroll Post-production Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist preroll post-production as resumable background jobs with accurate workspace and Task Center status.

**Architecture:** Add a `post_production` Pipeline Job handled by the existing worker. The UI submits immutable render/version snapshots and reacts to persisted job state instead of polling MediaKit inside dialogs.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, MediaKit, Vitest

---

### Task 1: Job model and worker

**Files:**
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/lib/pipeline-runner.ts`
- Modify: `src/lib/pipeline-job-status.ts`
- Test: `src/lib/pipeline-runner.test.ts`
- Test: `src/lib/pipeline-job-status.test.ts`

1. Add `post_production` job kind and preroll stage mapping.
2. Submit or poll MediaKit according to the stored job phase.
3. Persist ASR results in the job.
4. Store processed videos in TOS and update only the matching Render version.

### Task 2: Submission API

**Files:**
- Modify: `src/app/api/projects/[projectId]/post-production/route.ts`
- Test: `src/app/api/projects/[projectId]/post-production/route.test.ts`

1. Add an enqueue action with render and source-version validation.
2. Reject duplicate active jobs for a Render.
3. Start the worker immediately and return the Pipeline Job.

### Task 3: Background UI

**Files:**
- Modify: `src/components/preroll-video-tools-dialog.tsx`
- Modify: `src/components/preroll-post-production-controls.tsx`
- Modify: `src/components/pipeline-preroll-stage.tsx`
- Test: `src/components/preroll-post-production-controls.test.tsx`

1. Start ASR without opening the subtitle editor.
2. Show persisted operation state and progress beside the current video.
3. Open the editor from completed ASR output, automatically only while the same video remains mounted.
4. Close configuration dialogs after enqueueing processing jobs.

### Task 4: Task Center and validation

**Files:**
- Modify: `src/app/tasks/page.tsx`
- Test: `src/components/interactions.test.tsx`

1. Display operation-specific task names.
2. Run focused tests, TypeScript validation, all tests, and production build.
3. Verify live workspace and Task Center without submitting another paid task.

### Completion

- Added persistent `post_production` jobs for ASR, subtitle removal, subtitle burn-in, and enhancement.
- The worker now polls MediaKit, stores completed outputs in TOS, verifies subtitle output, and applies results only to the matching Render source version.
- Subtitle recognition runs without opening the editor; completed recognition opens automatically while mounted or remains available as Subtitle Review Pending after navigation.
- Task Center displays operation-specific names and the current video toolbar displays persisted progress and failure state.
- Confirmed that the previous subtitle result belongs to the 2026-08-21 Render, while the current preview is the enhanced 2026-08-23 Render.
- TypeScript validation, 43 test files with 318 tests, and the production build passed.
