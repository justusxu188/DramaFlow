# Subtitle API And Current Revision Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make MediaKit subtitle burning reliable for low-resolution post-production inputs and show exactly one current video in the result player.

**Architecture:** Before submitting an `add_subtitles` task, inspect the source video and normalize inputs whose short edge is below 720 pixels to a standard 720p H.264/AAC MP4. Persist the prepared input URL in the job so retries are idempotent, compare the prepared input with MediaKit's completed output during visual verification, and only then commit a new immutable render revision. The preview reads only the selected render's current `videoUrl`; all prior revisions remain accessible through the version history control.

**Tech Stack:** Next.js 16, TypeScript, MediaKit asynchronous APIs, FFmpeg/FFprobe, TOS, Vitest, Testing Library.

---

### Task 1: Preserve MediaKit Completion Evidence

**Files:**
- Modify: `src/lib/providers/mediakit.ts`
- Test: `src/lib/providers/providers.test.ts`

**Steps:**
1. Add a failing test asserting that subtitle task submission sends a stable `client_token`.
2. Add a failing test asserting that completed task metadata retains `request_id`, `resolution`, and `duration`.
3. Extend the provider response without treating `success=true` as task completion.
4. Run the provider tests.

### Task 2: Normalize Low-Resolution Subtitle Inputs

**Files:**
- Create: `src/lib/subtitle-video-normalization.ts`
- Modify: `src/lib/tos.ts`
- Test: `src/lib/subtitle-video-normalization.test.ts`

**Steps:**
1. Add tests for no-op handling at 720p or above and 480p conversion targets.
2. Download and inspect the source with FFprobe.
3. Convert low-resolution sources to a standard 720p H.264/AAC MP4 with FFmpeg.
4. Stream the normalized file to TOS and clean temporary files.
5. Return the prepared URL and diagnostic metadata.

### Task 3: Use Prepared Input In Subtitle Jobs

**Files:**
- Modify: `src/lib/pipeline-runner.ts`
- Test: `src/lib/pipeline-runner.test.ts`

**Steps:**
1. Add a failing test for a 480p source requiring preparation before MediaKit submission.
2. Persist `subtitlePreparedVideoUrl` and preparation metadata in job input.
3. Submit MediaKit with the prepared URL and the pipeline job ID as `client_token`.
4. After `status=completed`, require `result.video_url`.
5. Verify MediaKit output against the prepared input, then store the result and commit a new revision based on the original source revision.
6. Save provider task/request/result evidence in the completed job result.

### Task 4: Render Only The Current Video

**Files:**
- Modify: `src/components/preroll-prompt-editor.tsx`
- Test: `src/components/preroll-prompt-editor.test.tsx`

**Steps:**
1. Replace the test that expects every revision in the result pane.
2. Assert that only the selected render's current `videoUrl` is rendered.
3. Keep all revisions in `PrerollPostProductionControls` for rollback.
4. Assert that processing after rollback updates `currentRevisionId` to the newly appended revision.

### Task 5: Verification

**Steps:**
1. Run provider, runner, store, prompt editor, and post-production control tests.
2. Run TypeScript checks.
3. Run the full Vitest suite.
4. Run the Next.js production build.
5. Verify the project page shows one result video and version history still lists all revisions.
