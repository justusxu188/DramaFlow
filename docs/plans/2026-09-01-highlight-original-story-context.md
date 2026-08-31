# Highlight and Original Story Context Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make uploaded-highlight production use only the current batch's highlights by default, while allowing users to explicitly add selected original videos as reusable background context.

**Architecture:** Separate evidence scope from background scope. Selected highlights remain the only evidence used to mine arcs and generate scripts; selected original videos may enrich character and plot background. Cache understanding per immutable asset revision, then synthesize a run-scoped context from the selected evidence and background assets.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, local JSON persistence, optional Prisma/MySQL persistence, Vitest.

---

## Product Configuration

Add these fields to `ProductionConfig`:

```ts
export const storyContextModes = [
  "highlights_only",
  "highlights_with_originals",
] as const;

export type StoryContextMode =
  (typeof storyContextModes)[number];

type ProductionConfig = {
  // Existing fields...
  storyContextMode: StoryContextMode;
  selectedOriginalContextAssetIds: string[];
};
```

Defaults:

```ts
storyContextMode: "highlights_only",
selectedOriginalContextAssetIds: [],
```

Rules:

- These fields apply to `productionEntry === "uploaded_highlights"`.
- Existing production plans default to `highlights_only`.
- Selecting `highlights_with_originals` requires at least one valid original asset.
- Store the resolved original asset IDs in the run snapshot; do not resolve them again when reopening an old run.
- Do not add deployment environment variables for this behavior.
- Keep the media-understanding schema version as an internal code constant, not a user-facing setting.

## Task 1: Extend Production Configuration

**Files:**

- Modify: `src/lib/production-config.ts`
- Test: `src/lib/production-config.test.ts`

**Changes:**

- Add `storyContextModes`, `StoryContextMode`, `storyContextMode`, and `selectedOriginalContextAssetIds`.
- Extend `productionConfigObjectSchema`.
- Extend `defaultProductionConfig`.
- Extend `normalizeProductionConfig`.
- Deduplicate and cap original context IDs consistently with other asset selections.
- Verify old saved plans normalize to `highlights_only`.

**Tests:**

- Old config without the new fields uses safe defaults.
- Duplicate original asset IDs are removed.
- Invalid context mode is rejected or normalized.
- `highlights_only` clears or ignores original context IDs at execution time.

## Task 2: Add Asset-Level Understanding Cache

**Files:**

- Create: `src/lib/media-understanding.ts`
- Create: `src/lib/media-understanding.test.ts`
- Modify: `src/lib/pipeline-store.ts`
- Modify: `prisma/schema.prisma`

**Data types:**

```ts
type MediaUnderstanding = {
  assetId: string;
  assetRevisionKey: string;
  sourceKind: "source" | "highlight";
  sourceUrl: string;
  analysisProfileHash: string;
  analysis: StorylineResult;
  createdAt: string;
  updatedAt: string;
};
```

Cache identity:

```text
projectId + assetRevisionKey + analysisProfileHash
```

`assetRevisionKey` should prefer a real TOS object identity or content hash and must change when the file changes. `analysisProfileHash` must include provider/model, prompt contract version, snapshot mode, and output schema version.

**Store changes:**

- Add project-level `mediaUnderstandings`.
- Add `findReusableMediaUnderstanding`.
- Add `saveMediaUnderstanding`.
- Add in-flight lookup so two runs requesting the same cache key share one active job.
- Normalize missing fields for historical JSON data.
- Preserve `highlightAnalyses` during migration and read it as a compatibility fallback.

**Prisma:**

- Add a `MediaUnderstanding` model with a unique key over project, asset revision, and analysis profile.
- Add indexes for project/asset lookup.
- Keep `ProductionRun.snapshot` as the immutable run snapshot.

## Task 3: Stop Automatic Original-Story Reuse

**Files:**

- Modify: `src/app/api/projects/[projectId]/workflow/uploaded-highlights-preflight.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/start-uploaded-highlights.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/production-action-schemas.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/schema-common.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/start-production-types.ts`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`

**Behavior changes:**

- Remove the current rule that automatically chooses project original-story analysis whenever original assets exist.
- Always treat `selectedHighlightAssetIds` as `evidenceAssetIds`.
- Resolve `backgroundAssetIds` only when `storyContextMode === "highlights_with_originals"`.
- Validate every background asset belongs to the current project and is a source asset.
- For MediaKit-generated highlights, prefill related source IDs from asset metadata when available, but persist the final user-confirmed IDs.
- Snapshot both scopes into the new run before jobs start.

**Request snapshot:**

```ts
{
  storyContextMode,
  evidenceAssetIds: selectedHighlightAssetIds,
  backgroundAssetIds: selectedOriginalContextAssetIds,
}
```

## Task 4: Unify Analysis and Batch Context Jobs

**Files:**

- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/lib/pipeline-runner.ts`
- Modify: `src/lib/highlight-analysis.ts`
- Modify: `src/lib/pipeline-job-status.ts`
- Modify: `src/lib/project-progress.ts`
- Modify: `src/app/api/projects/[projectId]/pipeline/route.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/continue-production-command.ts`

**Job model:**

```text
media_analysis
  One job per uncached asset revision.

batch_context
  One job per run, dependent on all required evidence/background analyses.
```

**Execution rules:**

- Reuse completed cache entries immediately.
- Share an active `media_analysis` job across concurrent runs.
- Run missing highlight and original analyses in parallel.
- Build `batch_context` only after all required analyses complete.
- Store `evidenceAssetIds`, `backgroundAssetIds`, and their analysis revision keys in the batch context.
- Keep old `analysis`, `highlight_analysis`, and `highlight_context` jobs readable for historical runs.

**Failure behavior:**

- Never silently switch from `highlights_with_originals` to `highlights_only`.
- Expose retry for failed asset analyses.
- Allow an explicit user action to remove failed background assets and create a revised selection snapshot.

## Task 5: Enforce Evidence and Background Boundaries

**Files:**

- Modify: `src/lib/providers/ark.ts`
- Modify: `src/lib/pipeline-runner.ts`
- Modify: `src/lib/highlight-analysis.ts` or replace shared-context logic in `src/lib/media-understanding.ts`
- Test: `src/lib/pipeline-runner.test.ts`
- Test: `src/lib/highlight-analysis.test.ts`

**Prompt contract:**

- Evidence analyses may produce arcs, shots, dialogue evidence, and script facts.
- Background analyses may provide character identity, relationships, chronology, setting, and causal explanation.
- Background-only scenes must never become current-highlight evidence.
- Every generated arc must retain `sourceHighlightAssetId`.
- Script generation must receive the current run's evidence IDs and reject references outside that scope.

## Task 6: Add the User Choice to Production Settings

**Files:**

- Modify: `src/components/pipeline-production-plan-stage.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/components/pipeline-workspace-types.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/get-workspace.ts`
- Test: `src/components/interactions.test.tsx`

**UI behavior:**

- Show the control only for uploaded-highlight production when the project has original videos.
- Use a two-option segmented/radio control:
  - `仅理解本批次高光（推荐）`
  - `结合原剧剧情背景`
- Default to the first option.
- When original context is enabled, show selectable original assets.
- Prefill linked originals for MediaKit-generated highlights, but let the user confirm or change them.
- Display a preflight summary:

```text
本批次高光 5 个
可复用理解 3 个
需要新分析 2 个
原剧背景 2 个
```

- Persist settings per run so switching production versions restores the exact selection.

## Task 7: Update Status and Task Labels

**Files:**

- Modify: `src/app/tasks/page.tsx`
- Modify: `src/lib/pipeline-job-status.ts`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Test: `src/lib/pipeline-job-status.test.ts`
- Test: `src/lib/pipeline-task-verification.test.ts`

**Labels:**

- `media_analysis`: `素材剧情理解`
- `batch_context`: `批次剧情上下文`

**Status details:**

- Show total selected, reused, analyzing, completed, and failed counts.
- Reused cache entries are completed artifacts, not fake running jobs.
- Keep task-center visibility scoped by project ownership and administrator role.

## Task 8: Regression Coverage

**Files:**

- Modify: `src/app/api/projects/[projectId]/workflow/route.test.ts`
- Modify: `src/components/interactions.test.tsx`
- Modify: `src/lib/pipeline-runner.test.ts`
- Modify: `src/lib/pipeline-store.test.ts`
- Modify: `src/lib/production-config.test.ts`
- Modify: `src/lib/project-progress.test.ts`

**Required scenarios:**

1. Project has originals, default uploaded-highlight run still uses highlights only.
2. User explicitly selects original background and cached results are reused.
3. Missing original understanding runs in parallel with missing highlight understanding.
4. Two overlapping runs share cached and in-flight asset analysis.
5. Replacing a file invalidates the old understanding.
6. Changing analysis version invalidates the old understanding.
7. Background material cannot generate an arc without selected-highlight evidence.
8. Switching runs restores both evidence and background selections.
9. Historical runs without new fields remain readable.
10. Failure offers retry or explicit removal; no silent semantic fallback occurs.

**Verification commands:**

```bash
PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm test
PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm run typecheck
PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm run build
```

## Recommended Delivery Order

1. Add config fields and UI with default `highlights_only`.
2. Remove automatic original-story reuse and enforce evidence/background scopes.
3. Add project-level media-understanding cache and in-flight deduplication.
4. Migrate original-video analysis to the same cache model.
5. Add MySQL persistence and complete historical compatibility.

This order fixes the current semantic risk before undertaking the larger cache refactor.
