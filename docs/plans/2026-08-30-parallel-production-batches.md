# Parallel Production Batches Implementation Plan

> **For Claude:** Implement this plan task-by-task in the current workspace without committing unless the user explicitly requests a commit.

**Goal:** Allow users to create and immediately run independent production batches while other batches are active, with provider concurrency failures visible on the affected batch.

**Architecture:** Keep each batch immutable and identify every job and artifact write by `runId`. New batches bypass project-level active-job guards and immediately call `runPipelineJobNow`; continuing the current batch keeps its duplicate-submission guard. The UI exposes separate actions for continuing an eligible batch and creating a new batch.

**Tech Stack:** Next.js 16, React 19, TypeScript, local JSON pipeline persistence, Vitest, Testing Library.

---

### Task 1: Lock the behavior with tests

**Files:**
- Modify: `src/components/interactions.test.tsx`
- Modify: `src/app/api/projects/[projectId]/workflow/route.test.ts`
- Modify: `src/lib/pipeline-runner.test.ts`

1. Add a UI test showing that an active batch does not disable “新建生产批次”.
2. Add a UI test showing separate “继续当前批次” and “新建生产批次” actions when continuation is eligible.
3. Add route tests proving `run_full` starts despite another active job.
4. Assert source-video and batch-highlight start jobs immediately call `runPipelineJobNow`.
5. Assert analysis persistence receives the originating job `runId`.

### Task 2: Separate the production actions

**Files:**
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/components/pipeline-confirmation-modals.tsx`

1. Keep “继续当前批次” available only when the current batch is eligible and idle.
2. Add an explicit “新建生产批次” action whenever a batch already exists.
3. Do not disable the new-batch action because another batch has active jobs.
4. Always submit `run_full` from the new-batch action.
5. Explain in the confirmation dialog that active batches continue and the new batch starts independently.
6. Surface synchronous API errors in the existing workflow error region.

### Task 3: Start new batches immediately

**Files:**
- Modify: `src/app/api/projects/[projectId]/workflow/start-source-preflight.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/uploaded-highlights-preflight.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/start-source-production.ts`

1. Remove project-wide active-job rejection from new batch preflight.
2. Keep input, ownership, duration, and production-setting validation.
3. Immediately call `runPipelineJobNow` after creating source analysis and batch-highlight jobs.
4. Retain the Worker as recovery for queued or requeued jobs.

### Task 4: Make analysis writes run-scoped

**Files:**
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/lib/pipeline-runner.ts`

1. Add optional `runId` targeting to `saveAnalysis`.
2. Add optional `runId` targeting to `saveProductionPlan`.
3. Update a non-current run directly without hydrating or overwriting the current run.
4. Pass `job.runId` from the analysis runner to both persistence functions.
5. Reject writes for a missing originating run.

### Task 5: Verify

1. Run focused component, route, runner, and persistence tests.
2. Run the full Vitest suite.
3. Run TypeScript type checking.
4. Run the production build.
5. Inspect `git diff` and preserve unrelated runtime data changes.
