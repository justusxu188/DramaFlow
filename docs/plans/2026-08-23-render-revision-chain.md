# Render Revision Chain Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a reversible post-production revision chain to each single Render and replace the subtitle erase modal with a non-blocking docked video editor.

**Architecture:** `RenderVariant.videoUrl` remains the only current playback pointer. Immutable nested `revisions` record each generated or post-production output, its parent revision, source URL, operation, settings, and verification state. Rollback moves the current pointer to an existing revision; subsequent work creates a new child revision without restoring multiple Render records.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, local JSON/Prisma-backed pipeline store, MediaKit.

---

### Task 1: Add render revision persistence

**Files:**
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/components/pipeline-workspace-types.ts`
- Test: `src/lib/pipeline-store.test.ts`

1. Add `RenderRevision` with immutable URL, parent ID, operation, settings snapshot, subtitle metadata, and timestamps.
2. Initialize a generated revision when a Render first receives a video URL.
3. Add `commitRenderRevision` to atomically append a child revision and advance `RenderVariant.videoUrl`.
4. Add `activateRenderRevision` to move the current pointer to a historical revision and invalidate dependent compositions.
5. Test linear chaining, rollback, branching, and composition invalidation.

### Task 2: Enforce version-aware post-production jobs

**Files:**
- Modify: `src/app/api/projects/[projectId]/post-production/route.ts`
- Modify: `src/lib/pipeline-runner.ts`
- Test: `src/app/api/projects/[projectId]/post-production/route.test.ts`
- Test: `src/lib/pipeline-runner.test.ts`

1. Snapshot `sourceRevisionId` and `sourceVideoUrl` when enqueueing.
2. Reuse only the same operation on the same source revision.
3. Reject a different mutating operation while another one is active.
4. Commit completed outputs through `commitRenderRevision`.
5. Add `activate_revision` API action with current-version conflict protection.

### Task 3: Add revision history controls

**Files:**
- Modify: `src/components/preroll-post-production-controls.tsx`
- Modify: `src/components/pipeline-workspace-types.ts`
- Modify: `src/components/pipeline-preroll-stage.tsx`
- Test: `src/components/preroll-post-production-controls.test.tsx`

1. Show the current revision operation and creation time.
2. Add an inline revision history panel.
3. Allow rollback to an earlier revision without deleting descendants.
4. Refresh the current video after rollback.
5. Keep all processing actions bound to the selected current revision.

### Task 4: Replace the subtitle erase modal with a docked editor

**Files:**
- Modify: `src/components/preroll-video-tools-dialog.tsx`
- Modify: `src/components/preroll-post-production-controls.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/preroll-post-production-controls.test.tsx`

1. Remove the full-page visual backdrop from dialogs.
2. Render video tools in a fixed dock with no page-wide dimming or blur.
3. Pass the exact source video URL and revision label into the dock.
4. Add an embedded player for subtitle erasing.
5. Add controls that capture the player's current time as range start/end.
6. Add minimize/restore behavior while preserving unsaved settings.
7. Keep advanced subtitle detection parameters collapsed by default.

### Task 5: Migrate and verify

**Files:**
- Modify: `data/pipeline-store.json`

1. Reconstruct available revision chains from completed post-production jobs.
2. Ensure every current Render has exactly one `currentRevisionId`.
3. Run `npm run typecheck`.
4. Run `npm test`.
5. Run `npm run build`.
6. Verify rollback, chained processing, docked editing, and responsive layout in the browser.
