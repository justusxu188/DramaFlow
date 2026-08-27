# Preroll Prompt Studio Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move prompt compilation and video submission into the AI preroll-video stage, add persistent editable prompts and generation settings, and segment only at shot boundaries.

**Architecture:** The script stage owns script drafting and confirmation only. The preroll stage owns a per-script prompt studio whose saved snapshot contains generation settings, atomic shot groups, editable submitted prompts, and reference assets. API validation and the runner consume this snapshot directly so user edits cannot be overwritten during submission.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, Vitest, Testing Library

---

### Task 1: Shot-Aware Segmentation

**Files:**
- Modify: `src/lib/production-config.ts`
- Modify: `src/lib/production-config.test.ts`
- Modify: `src/lib/providers/ark.ts`
- Modify: `src/lib/seedance-prompt.ts`
- Modify: `src/lib/seedance-prompt.test.ts`

**Steps:**
1. Add failing tests for 4-second minimums, 15/30-second model limits, balanced contiguous shot grouping, and an oversized single-shot rejection.
2. Implement a contiguous shot-group planner that never splits a shot.
3. Pass shot-group durations and beat IDs into prompt compilation.
4. Make prompt normalization preserve those exact groups.
5. Run focused library and provider tests.

### Task 2: Editable Prompt Snapshot API

**Files:**
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/lib/pipeline-store.test.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/script-action-schemas.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/schema.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/script-commands.ts`
- Create: `src/app/api/projects/[projectId]/workflow/update-video-prompt-command.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/compile-prompts-command.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/compile-prompts-preflight.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/preroll-command.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/preroll-preflight.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/route.test.ts`

**Steps:**
1. Add schemas for per-script generation settings and edited prompt segments.
2. Persist `submittedPrompt`, reference asset IDs, settings, and explicit prompt confirmation.
3. Compile prompts with the requested per-script settings instead of mutable project defaults.
4. Require a confirmed prompt snapshot before video submission.
5. Submit the exact saved model, duration, ratio, resolution, subtitle mode, prompts, and asset references.
6. Add API and store regression tests.

### Task 3: Simplify The Script Stage

**Files:**
- Modify: `src/components/pipeline-script-workspace.tsx`
- Modify: `src/components/pipeline-script-details.tsx`
- Modify: `src/components/interactions.test.tsx`

**Steps:**
1. Remove prompt compilation and video submission controls from stage 05.
2. Remove the duplicate summary, inverse-delete action, and step labels.
3. Remove the persistent highlight-video player while retaining compact highlight navigation.
4. Keep script editing, selection, confirmation, bulk deletion, and delete-unconfirmed behavior.

### Task 4: Build The Preroll Prompt Studio

**Files:**
- Create: `src/components/preroll-prompt-editor.tsx`
- Modify: `src/components/pipeline-preroll-stage.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/components/pipeline-workspace-types.ts`
- Modify: `src/app/globals.css`
- Modify: `src/components/interactions.test.tsx`
- Modify: `src/components/pipeline-artifact-folding.test.tsx`

**Steps:**
1. List confirmed scripts in stage 06 with clear prompt states.
2. Auto-bind matching image assets and show thumbnails.
3. Insert visible `@人物名` references into generated prompt text while preserving structured asset bindings.
4. Add editable segment textareas and per-script controls for model, total duration, resolution, ratio, and subtitles.
5. Persist edits with a `保存并确认提示词` command.
6. Enable video generation only for confirmed, current prompt snapshots.
7. Keep generated-video review and post-production below the preparation area.
8. Add narrow-screen and state-transition tests.

### Task 5: Full Verification

**Steps:**
1. Run TypeScript checking and focused tests.
2. Run all tests and the production build.
3. Verify stages 05 and 06 in the real project without submitting a paid video-generation task.
4. Check desktop and narrow layouts, browser console, prompt persistence after refresh, and absence of page-level overflow.
