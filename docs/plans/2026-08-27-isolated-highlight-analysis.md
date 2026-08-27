# Isolated Highlight Analysis Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Analyze multiple uploaded highlights from the same drama in parallel, reuse cached understanding, share only stable drama context, and keep every plot evidence domain isolated by source highlight.

**Architecture:** Add run-scoped `highlightAnalyses` and `sharedStoryContext` data. Replace the single combined uploaded-highlight analysis job with one child analysis job per asset plus one coordinator job, then generate one grounded arc per highlight and pass only that highlight's analysis into script generation.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma/MySQL with JSON fallback, Vitest, Ark, MediaKit.

---

### Task 1: Add Run-Scoped Analysis Contracts

**Files:**
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/components/pipeline-workspace-types.ts`
- Test: `src/lib/pipeline-store.test.ts`

**Steps:**
1. Add failing tests for saving and reading analysis by `runId` and `sourceHighlightAssetId`.
2. Add `HighlightAnalysis` and `SharedStoryContext` types.
3. Add optional `highlightAnalyses` and `sharedStoryContext` fields to project/run snapshots.
4. Normalize historical runs with empty/default values.
5. Add run-aware save and cache lookup helpers.
6. Run `vitest src/lib/pipeline-store.test.ts`.

### Task 2: Create Per-Highlight Analysis Jobs

**Files:**
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/lib/pipeline-runner.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/start-uploaded-highlights.ts`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`
- Test: `src/lib/pipeline-runner.test.ts`

**Steps:**
1. Add `highlight_analysis` and `highlight_context` job kinds.
2. Create uploaded Highlight records before analysis starts.
3. Enqueue one `highlight_analysis` job per selected asset.
4. Enqueue one coordinator job containing the child job IDs.
5. Analyze one URL per child job and reuse cached results when available.
6. Store snapshots under the owning Run and highlight.
7. Run route and runner tests.

### Task 3: Build Shared Drama Context

**Files:**
- Modify: `src/lib/pipeline-runner.ts`
- Modify: `src/lib/pipeline-store.ts`
- Test: `src/lib/pipeline-runner.test.ts`

**Steps:**
1. Add a deterministic context builder from completed local analyses.
2. Preserve source highlight IDs on every context summary.
3. Let the coordinator wait for all children and fail clearly if any child failed.
4. Save shared context once and enqueue one local `mine_arcs` job per highlight.
5. Keep a merged legacy analysis only for current UI compatibility.
6. Run runner tests.

### Task 4: Bind Arcs and Scripts to Local Evidence

**Files:**
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/lib/pipeline-runner.ts`
- Modify: `src/lib/providers/ark.ts`
- Test: `src/lib/providers/providers.test.ts`
- Test: `src/lib/pipeline-runner.test.ts`

**Steps:**
1. Add `sourceHighlightAssetId` and `highlightId` provenance to StoryArc.
2. Make arc saving additive and run-aware for parallel jobs.
3. Generate each uploaded highlight's arc from only its local analysis.
4. Pass shared context as background metadata, never as evidence clips.
5. Generate scripts from the current highlight analysis and same-highlight arcs only.
6. Run provider and runner tests.

### Task 5: Preserve Incremental Workspace Behavior

**Files:**
- Modify: `src/components/pipeline-workspace-types.ts`
- Modify: `src/components/pipeline-analysis-stage.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Test: `src/components/interactions.test.tsx`

**Steps:**
1. Expose per-highlight analysis status in the workspace contract.
2. Keep completed highlights visible while siblings are still running.
3. Display each uploaded filename with its own understanding status.
4. Prevent a failed highlight from blocking completed siblings.
5. Run interaction tests.

### Task 6: Full Regression

**Files:**
- Verify all modified files.

**Steps:**
1. Run `tsc --noEmit`.
2. Run the full Vitest suite.
3. Run `next build`.
4. Verify uploaded-highlight jobs and artifacts remain bound to their original Run after switching production versions.

