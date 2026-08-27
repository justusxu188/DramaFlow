# Video Finishing Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add precise subtitle removal, merged subtitle recognition/burn-in, preroll quality enhancement, compose navigation, and basic image/text watermarking.

**Architecture:** Extend the existing MediaKit post-production API and persist operation settings with each preroll render. Keep complex controls in focused modals, reuse the current async task polling, and isolate VOD watermark calls behind a provider adapter.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, MediaKit API, Volcengine VOD OpenAPI, Vitest

---

### Task 1: Subtitle range domain logic

**Files:**
- Modify: `src/lib/subtitle-post-production.ts`
- Modify: `src/lib/subtitle-post-production.test.ts`

1. Add failing tests for range normalization, complement calculation, and cue clipping.
2. Implement deterministic range helpers.
3. Run the focused unit tests.

### Task 2: Precise MediaKit operations

**Files:**
- Modify: `src/lib/providers/mediakit.ts`
- Modify: `src/lib/providers/mediakit.test.ts`
- Modify: `src/app/api/projects/[projectId]/post-production/route.ts`
- Modify: `src/app/api/projects/[projectId]/post-production/route.test.ts`

1. Add precise erase schema and payload tests.
2. Add enhancement options used by the preroll UI.
3. Preserve current async task status semantics.
4. Run provider and route tests.

### Task 3: Persist operation snapshots

**Files:**
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/post-production-action-schemas.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/update-preroll-render-command.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/route.test.ts`

1. Add render operation metadata and history types.
2. Validate and store subtitle scope or enhancement settings.
3. Verify stale-source conflict handling remains intact.

### Task 4: Preroll editing modal

**Files:**
- Modify: `src/components/preroll-post-production-controls.tsx`
- Modify: `src/components/pipeline-preroll-stage.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/interactions.test.tsx`

1. Replace separate Recognize Subtitles with Add Subtitles.
2. Run ASR when the Add Subtitles modal opens.
3. Apply the persisted erase scope by default.
4. Add precise erase and quality enhancement dialogs.
5. Make Compose navigate to Final Output after submission.

### Task 5: Basic image and text watermark

**Files:**
- Create: `src/lib/providers/vod-watermark.ts`
- Create: `src/lib/providers/vod-watermark.test.ts`
- Modify: `src/lib/env.ts`
- Modify: `.env.example`
- Modify: `src/app/api/projects/[projectId]/post-production/route.ts`
- Modify: `src/components/pipeline-final-outputs-stage.tsx`
- Modify: `src/app/globals.css`

1. Add VOD configuration validation for image and text templates.
2. Add a provider boundary for starting and polling watermark workflows.
3. Add image/text watermark modal controls to completed compositions.
4. Keep the current output active until the watermark result succeeds.

### Task 6: Regression validation

1. Run focused tests after each task.
2. Run `npm run typecheck`.
3. Run `npm test`.
4. Run `npm run build`.
5. Verify the preroll and final-output dialogs at desktop and mobile widths.

### Completion

- Completed Tasks 1-5.
- Passed TypeScript validation, 43 test files with 313 tests, and the Next.js production build.
- Verified the 06 post-production toolbar and 07 watermark entry on the live project page at a 675px viewport; a fresh browser session reported no runtime console errors.
- Paid MediaKit and VOD submissions were intentionally not triggered during UI verification.
- Real watermark workflow verification remains dependent on configured VOD space, bucket, playback domain, workflow, and image/text watermark templates.
