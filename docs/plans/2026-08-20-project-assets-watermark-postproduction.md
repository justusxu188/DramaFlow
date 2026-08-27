# Project Assets and Post-Production Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate reusable assets from project production history, preserve complete Seedance prompts, improve project navigation, and extend post-production with unified subtitles, scoped video selection, and VOD watermark readiness.

**Architecture:** Project runs remain the source of truth for intermediate, candidate, discarded, and final outputs. The library contains only reusable source videos, image assets, highlights, and outputs explicitly saved by a user. Post-production selects a project and one or more videos from grouped folders; timeline and subtitle review remain single-video operations, while batch-safe operations can use the selected scope.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, React Testing Library, Volcano Engine MediaKit, Volcano Engine VOD.

---

### Task 1: Define asset ownership and project overview

**Files:**
- Create: `src/components/project-overview.tsx`
- Modify: `src/components/pipeline-workspace.tsx`
- Modify: `src/components/project-dashboard.tsx`
- Modify: `src/app/library/page.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/interactions.test.tsx`

**Steps:**
1. Add a project overview shown when `/projects/[projectId]` has no `workType`.
2. Render production runs, stage counts, candidate outputs, complete prompts, and creation times in the overview.
3. Make project rows open the overview; keep all creation flow links in the overflow menu.
4. Give the overflow menu an opaque background, fixed stacking, click-outside close, and Escape close.
5. Remove production run rendering from the library while retaining reusable source videos, images, and highlights.
6. Test overview navigation and menu dismissal.

### Task 2: Persist final Seedance submission prompts

**Files:**
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/lib/pipeline-runner.ts`
- Modify: `src/lib/seedance-prompt.ts`
- Test: `src/lib/pipeline-runner.test.ts`

**Steps:**
1. Add `submittedPrompt` to each compiled video prompt segment.
2. Build the exact Seedance request prompt immediately after compilation.
3. Persist the enriched plan and make `script.videoPrompt` contain the complete submitted prompts.
4. Continue deriving complete prompts for legacy runs that lack the new field.
5. Test that the stored prompt includes global style, character/scene locks, sound, subtitle, text, and negative constraints.

### Task 3: Unify subtitle processing

**Files:**
- Modify: `src/components/video-post-production-workspace.tsx`
- Test: `src/components/interactions.test.tsx`

**Steps:**
1. Replace “语音转字幕” and “视频加字幕” with one “添加字幕” operation directly below “字幕擦除”.
2. Keep recognition, editing, manual confirmation, and burn-in in one panel.
3. Preserve the API-level `confirmed: true` gate.
4. Test that burn-in stays disabled until subtitles are reviewed and confirmed.

### Task 4: Add project, folder, and multi-video selection

**Files:**
- Modify: `src/components/video-post-production-workspace.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/interactions.test.tsx`

**Steps:**
1. Replace the passive project title with a “选择项目” picker.
2. Group videos by original videos, highlight edits, and available production outputs.
3. Support checkbox selection for multiple videos and an explicit current editing video.
4. Require one current video for timeline and subtitle review.
5. Keep selected scope visible and stable when switching tools.
6. Test project switching, folder grouping, multi-select, and active-video behavior.

### Task 5: Add VOD watermark configuration and capability gate

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `src/app/api/projects/[projectId]/post-production/route.ts`
- Modify: `src/components/video-post-production-workspace.tsx`
- Modify: `.env.example`
- Test: `src/app/api/projects/[projectId]/post-production/route.test.ts`

**Steps:**
1. Add explicit VOD environment settings for access key, secret key, space name, and template/workflow identifiers.
2. Add an “添加明水印” operation after speed adjustment.
3. Support template-based image/video/text watermarks and dynamic text variables.
4. Return a clear configuration error when VOD credentials or a template/workflow are absent.
5. Do not treat TOS credentials as implicit VOD authorization.
6. Add provider execution only after valid VOD configuration is supplied.

### Task 6: Verify

**Steps:**
1. Run focused component, pipeline, and API tests.
2. Run the complete Vitest suite.
3. Run TypeScript checking.
4. Run the production build sequentially.
5. Verify project overview, overflow dismissal, library folders, unified subtitles, and video selection in the browser.

No git commits are created unless explicitly requested.
