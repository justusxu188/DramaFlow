# AI Preroll Ordering And Character Images Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make script generation fully parallel, order AI preroll work by the user's latest script entry, group every video version by script, and merge video-frame extraction into a two-mode character image generator.

**Architecture:** Persist a `prerollOpenedAt` timestamp on each script and sort confirmed script groups by that timestamp. Keep the existing single-Render immutable revision chain, displaying all video revisions inside the owning script group. Store extracted frames as hidden intermediate image assets and pass those assets into Seedream to create selectable final character images.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Vitest, Prisma/MySQL with JSON fallback, MediaKit, Seedream.

---

### Task 1: Submit N Script Requests Concurrently

**Files:**
- Modify: `src/lib/providers/ark.ts`
- Test: `src/lib/providers/providers.test.ts`

1. Add a deferred-response test with `count: 4`.
2. Assert all four HTTP requests start before any response resolves.
3. Replace the fixed three-item batching loop with one `Promise.all`.
4. Run the provider tests.

### Task 2: Persist AI Preroll Entry Time

**Files:**
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/components/pipeline-workspace-types.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/script-action-schemas.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/schema.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/simple-commands.ts`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`

1. Add optional `prerollOpenedAt` to script records.
2. Add a dedicated `open_preroll_script` workflow action.
3. Persist the current ISO timestamp without invalidating the script or prompt.
4. Optimistically place the clicked script first and refresh persisted data.

### Task 3: Group And Sort Preroll Videos

**Files:**
- Modify: `src/components/preroll-prompt-editor.tsx`
- Test: `src/components/preroll-prompt-editor.test.tsx`

1. Sort script groups by `prerollOpenedAt` descending.
2. Use latest video creation time only as a fallback for never-opened scripts.
3. Render all revisions for the script in descending creation order.
4. Keep post-production actions bound to the active revision only.

### Task 4: Model Hidden Capture Assets

**Files:**
- Modify: `src/lib/project-store.ts`
- Modify: `src/components/pipeline-workspace-types.ts`
- Modify: `src/app/api/projects/[projectId]/assets/capture/route.ts`
- Test: corresponding asset route tests

1. Extend source types with `seedream_text` and `seedream_from_capture`.
2. Add `intermediate` and `usableAsCharacterReference` metadata.
3. Store captured frames as hidden intermediate assets.
4. Preserve source video ID and millisecond-precision timestamp.

### Task 5: Merge Capture Into Character Image Generation

**Files:**
- Modify: `src/components/library-asset-uploader.tsx`
- Modify: `src/app/api/projects/[projectId]/assets/generate-image/route.ts`
- Test: `src/components/library-asset-uploader.test.tsx`

1. Rename actions to “上传角色图片” and “生成角色图片”.
2. Remove the standalone capture entry.
3. Add text-generation and video-screenshot modes inside character generation.
4. In screenshot mode, extract a frame, then automatically submit it as the Seedream reference.
5. Name final images `角色名-造型名-来源`, adding numeric suffixes only for duplicates.

### Task 6: Filter Selectable Character Images

**Files:**
- Modify: `src/app/library/page.tsx`
- Modify: `src/components/preroll-prompt-editor.tsx`
- Modify: `src/components/pipeline-workspace-types.ts`
- Test: relevant library and preroll component tests

1. Hide intermediate captures from the formal image list and counts.
2. Allow uploaded, text-generated, screenshot-generated, and legacy Seedream images.
3. Exclude raw `video_capture` and `confirmed_frame` assets from AI preroll selection.

### Task 7: Regression Verification

1. Run targeted provider, workflow, library, preroll, and subtitle tests.
2. Run the complete Vitest suite.
3. Run `tsc --noEmit`.
4. Run the production build.
5. Verify the library and AI preroll flows in the browser.
