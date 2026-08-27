# Unified Assets and Production Modes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the existing project library into a reusable asset center and support full-drama, uploaded-highlight, and batch-highlight production in either Agent or manual mode.

**Architecture:** Reuse the existing Prisma `Asset` model and distinguish reusable assets with `kind` and structured `metadata`. Extend the current workflow orchestration instead of creating parallel pipelines: each production run records its entry type and execution mode, then reuses the existing script, prompt, video, and composition jobs.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma/MySQL, local JSON fallback, TOS V4 uploads, MediaKit, Seedream, Seedance, Vitest.

---

### Task 1: Expand reusable project asset types

**Files:**
- Modify: `src/lib/project-store.ts`
- Modify: `src/app/api/projects/[projectId]/assets/route.ts`
- Test: `src/lib/domain.test.ts`

**Steps:**
1. Add `CharacterImageAsset` metadata for role, look name, source type, view type, and primary-image state.
2. Add `HighlightAsset` with `kind: "highlight"` and source metadata for `user` or `mediakit`.
3. Extend the project asset API to create image and highlight records after direct TOS upload.
4. Verify database and local JSON paths return these assets separately from source episodes.

### Task 2: Add reusable image and highlight upload UI

**Files:**
- Create: `src/components/library-asset-uploader.tsx`
- Modify: `src/app/library/page.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/interactions.test.tsx`

**Steps:**
1. Add image upload with user-defined asset name, role name, and look name.
2. Allow multiple images for the same role.
3. Add user-highlight video upload with display name and optional source relationship.
4. Refresh the library after upload and display source badges.

### Task 3: Add video-frame character capture

**Files:**
- Create: `src/app/api/projects/[projectId]/assets/capture/route.ts`
- Modify: `src/lib/providers/mediakit.ts`
- Modify: `src/app/library/page.tsx`
- Modify: `src/components/library-asset-uploader.tsx`
- Test: `src/lib/providers/providers.test.ts`

**Steps:**
1. Provide a video picker, player, time scrubber, and current timestamp field.
2. Request a MediaKit snapshot for the selected source video timestamp.
3. Transfer the returned snapshot to the project `图像资产` TOS folder.
4. Save it as a named character baseline image.

### Task 4: Generate character looks with Seedream

**Files:**
- Create: `src/app/api/projects/[projectId]/assets/generate-image/route.ts`
- Modify: `src/lib/providers/types.ts`
- Modify: `src/lib/providers/ark.ts`
- Modify: `src/components/library-asset-uploader.tsx`
- Test: `src/lib/providers/providers.test.ts`

**Steps:**
1. Add Seedream 5.0 Lite and Pro model choices.
2. Accept a baseline image, role name, look name, and natural-language look description.
3. Persist generated results as additional images under the same role.
4. Keep generation asynchronous and show task status without blocking production.

### Task 5: Add three production entries and two execution modes

**Files:**
- Modify: `src/lib/production-config.ts`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`
- Modify: `src/lib/pipeline-runner.ts`
- Test: `src/lib/production-config.test.ts`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`

**Steps:**
1. Add `productionEntry`: `full_drama`, `uploaded_highlights`, or `batch_highlights`.
2. Add `executionMode`: `manual` or `agent`.
3. Select project highlight assets for uploaded-highlight production.
4. In Agent mode, automatically confirm valid scripts, compile prompts, generate prerolls, and compose.
5. In manual mode, retain script confirmation and current submission controls.

### Task 6: Improve library information architecture

**Files:**
- Modify: `src/app/library/page.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/interactions.test.tsx`

**Steps:**
1. Use project-level folders for source video, character assets, and highlight clips.
2. Group character images by role and show multiple looks.
3. Label MediaKit clips as `MediaKit 高光` and uploads as `用户高光`.
4. Reduce run folders to production summary, status, counts, and timestamps.

### Task 7: Add playable advertisement material groups

**Files:**
- Modify: `src/app/library/page.tsx`
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/app/globals.css`
- Test: `src/components/interactions.test.tsx`

**Steps:**
1. Group each composition with its preroll render, highlight, and script.
2. Show playable final video, preroll video, and highlight video.
3. Show the related script title and expandable script body.
4. Display role images, model, source type, version, and generation time.

### Task 8: Complete verification

**Files:**
- Test: all touched test files

**Steps:**
1. Run `node_modules/.bin/vitest run`.
2. Run `node_modules/.bin/tsc --noEmit`.
3. Run `node_modules/.bin/next build`.
4. Verify upload, playback, responsive layout, and mode switching in the browser.
