# AI Preroll Subtitle and Composition Integrity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure internal visual analysis stays hidden, subtitle confirmation never implies subtitle application, visible subtitle pixels are verified before persistence, and every final composition is bound to the exact verified preroll version visible to the user.

**Architecture:** Keep visual-style analysis in pipeline data and prompt compilation, but remove its detailed UI block. Model preroll post-production as explicit recognition, confirmation, application, and media-verification states. At active subtitle timestamps, compare source and output video frames in the subtitle region with FFmpeg; a completed provider task without visible pixel changes fails closed. Send the displayed preroll URL to the workflow API, validate and re-verify it against the current Render, and create an independent Composition version with a subtitle-verification snapshot for every accepted composition request.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Vitest, React Testing Library, MediaKit, JSON-backed pipeline store.

---

### Task 1: Hide Internal Visual Analysis

**Files:**
- Modify: `src/components/batch-pipeline-panel.tsx`
- Test: `src/components/interactions.test.tsx`

1. Add a regression assertion that the script review UI does not render the detailed `高光视觉风格` block.
2. Remove only the detailed block; retain the concise generation-basis statement.
3. Run the component tests.

### Task 2: Separate Subtitle Workflow States

**Files:**
- Modify: `src/components/preroll-post-production-controls.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/lib/pipeline-store.ts`
- Test: `src/components/preroll-post-production-controls.test.ts`

1. Track the persisted post-production operation on each Render.
2. Keep confirmation as a local review action that performs no request.
3. Mark subtitle edits as unapplied.
4. Block composition while recognized subtitles have not been applied.
5. Persist `add_subtitles` or `erase_subtitles` with the processed URL.
6. Run focused component and store tests.

### Task 2A: Verify Visible Subtitle Pixels

**Files:**
- Add: `src/lib/subtitle-video-verification.ts`
- Modify: `src/app/api/projects/[projectId]/post-production/route.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`
- Test: `src/app/api/projects/[projectId]/post-production/route.test.ts`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`

1. Use the MediaKit `center` position verified to be visible on 854x480 prerolls.
2. Sample up to three active subtitle timestamps.
3. Compare source/output center-region frames and reject outputs without strong pixel differences.
4. Re-run verification against the stored TOS URL before marking the Render verified.
5. Fail closed when FFmpeg is unavailable, verification times out, or no visible subtitle pixels are detected.

### Task 3: Bind Composition to the Displayed Render Version

**Files:**
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`
- Modify: `src/components/preroll-post-production-controls.tsx`
- Modify: `src/lib/pipeline-runner.ts`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`
- Test: `src/lib/pipeline-store.test.ts`

1. Require `renderVideoUrl` in `compose_preroll`.
2. Reject stale client URLs that differ from the current Render URL.
3. Reuse an active composition only when Render, Highlight, and URL all match.
4. Generate a unique `compositionId` for every new request.
5. Preserve the URL snapshot through MediaKit submission and completion.
6. Persist whether the exact source Render was subtitle-verified.
7. Reject direct worker composition attempts for unverified subtitle versions.
8. Run route, runner, and store tests.

### Task 4: Audit the Production Model

**Files:**
- Review: `src/lib/pipeline-store.ts`
- Review: `src/app/api/projects/[projectId]/workflow/route.ts`
- Review: `src/lib/pipeline-runner.ts`
- Review: `src/lib/pipeline-job-status.ts`
- Review: `src/lib/pipeline-task-verification.ts`

Verify that production plans affect only future runs, active runs retain frozen material and configuration snapshots, jobs bind to run/stage/artifact identifiers, and historical outputs remain versioned.

### Task 5: Full Verification

1. Run focused tests and TypeScript checks.
2. Run the complete Vitest suite.
3. Run the production build.
4. Use the local UI to verify script review, subtitle recognition, confirmation, subtitle application, composition, task evidence, and final-output version selection.
5. Inspect the persisted Job, Render, and Composition records to confirm exact URL and ID bindings.
