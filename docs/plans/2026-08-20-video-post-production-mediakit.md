# Video Post-Production MediaKit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Connect seven AI MediaKit post-production capabilities and provide a non-destructive multi-cut timeline with human-confirmed subtitles.

**Architecture:** Extend the MediaKit provider with typed post-production operations, expose a project-scoped API that submits and polls asynchronous jobs, and transfer every completed temporary output to TOS. The client maintains an edit decision list of retained segments, uses trim plus concat for export, and requires users to review ASR subtitle rows before subtitle burn-in.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zod, AI MediaKit, TOS, Vitest, React Testing Library.

---

### Task 1: Typed MediaKit post-production provider

**Files:**
- Modify: `src/lib/providers/mediakit.ts`
- Test: `src/lib/providers/providers.test.ts`

1. Add typed submission helpers for generative enhancement, subtitle erasure, trim, speed adjustment, ASR, subtitle burn-in, and concat.
2. Normalize completed `video_url`, duration, and ASR `subtitles`.
3. Test every endpoint path and request body.

### Task 2: Project-scoped post-production API

**Files:**
- Create: `src/app/api/projects/[projectId]/post-production/route.ts`
- Create: `src/app/api/projects/[projectId]/post-production/route.test.ts`

1. Validate operation-specific payloads with Zod.
2. Submit MediaKit jobs and poll task status.
3. Transfer completed video outputs to TOS before returning them.
4. Return ASR subtitle drafts without burning them into video.

### Task 3: Non-destructive timeline model

**Files:**
- Create: `src/lib/video-edit-timeline.ts`
- Create: `src/lib/video-edit-timeline.test.ts`

1. Represent retained segments with source start/end and stable IDs.
2. Split at any valid playhead point.
3. Delete segments while keeping at least one segment.
4. Calculate edited duration and ordered trim requests.

### Task 4: Post-production workspace

**Files:**
- Modify: `src/components/video-post-production-workspace.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/video-post-production-workspace.test.tsx`

1. Add a draggable playhead synchronized with video playback.
2. Add split, delete segment, undo, and segment selection controls.
3. Add trim and concat export workflow for all retained segments.
4. Add subtitle erase, speed, enhancement, and subtitle settings panels.
5. Add ASR generation, editable subtitle rows, explicit confirmation, and burn-in.
6. Show asynchronous progress, failure, retry, and completed output.

### Task 5: Library folder behavior

**Files:**
- Modify: `src/components/library-project-section.tsx`
- Modify: `src/app/library/page.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/library-project-section.test.tsx`

1. Keep project and asset folders collapsed by default.
2. Render `FolderClosed` while collapsed and `FolderOpen` while expanded.
3. Preserve click-to-toggle behavior and responsive layout.

### Task 6: Verification

1. Run focused provider, API, timeline, workspace, and library tests.
2. Run the complete Vitest suite.
3. Run `tsc --noEmit`.
4. Run `next build`.
5. Verify desktop and mobile interaction in the browser.
