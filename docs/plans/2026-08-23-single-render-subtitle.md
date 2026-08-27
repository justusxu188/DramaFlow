# Single Render Subtitle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the current preroll video the only Render per script and ensure subtitle output replaces that single current video.

**Architecture:** `RenderVariant.videoUrl` is the only playable URL. Post-production mutates that Render after MediaKit returns `result.video_url`, TOS storage succeeds, and subtitle verification passes. Legacy processed/original URL fields, historical Render UI, and the old browser-save command are removed.

**Tech Stack:** Next.js 16, React 19, TypeScript, MediaKit, Vitest

---

### Task 1: Single Render model

**Files:**
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/components/pipeline-workspace-types.ts`
- Test: `src/lib/pipeline-store.test.ts`

1. Remove Render `originalVideoUrl`, `processedVideoUrl`, and post-production URL history.
2. Make `mergeRenderVersion` assign only `videoUrl`.
3. Keep only the latest Render for each script.

### Task 2: Remove legacy update path

**Files:**
- Delete: `src/app/api/projects/[projectId]/workflow/update-preroll-render-command.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/post-production-action-schemas.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/post-production-commands.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`

1. Remove `update_preroll_render`.
2. Keep only background `post_production` jobs for processing.

### Task 3: Current subtitle output

**Files:**
- Modify: `src/lib/pipeline-runner.ts`
- Modify: `src/app/api/projects/[projectId]/post-production/route.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/compose-preroll-command.ts`

1. Validate job source against `render.videoUrl`.
2. Read MediaKit completion from `result.video_url`.
3. Store the file and replace `render.videoUrl`.
4. Compose only from `render.videoUrl`.

### Task 4: Remove history UI and validate

**Files:**
- Modify: `src/components/pipeline-preroll-stage.tsx`
- Modify: `src/components/preroll-post-production-controls.tsx`
- Test: related component and route tests

1. Remove the historical Render section.
2. Display only current Render operation state.
3. Migrate current project data to one Render per script.
4. Run TypeScript, all tests, build, and live page verification.
