# Script Selection And Prompt Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the script entering stage 06 explicit and avoid unnecessary AI prompt regeneration for output-only video settings.

**Architecture:** Script confirmation remains the eligibility gate for video production. Each confirmed script gets its own stage-06 navigation action. Prompt content validity is separated from submission-setting changes, and prompt saves persist the latest video settings snapshot before generation.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, Vitest, Testing Library.

---

### Task 1: Clarify script confirmation and navigation

**Files:**
- Modify: `src/components/pipeline-script-workspace.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/interactions.test.tsx`

1. Keep row-level confirmation for a single draft.
2. Keep `确认所选` as the batch confirmation action.
3. Remove the ambiguous global stage-06 navigation button.
4. Add `前往视频` to each confirmed script row.
5. Prevent confirmation text from wrapping.

### Task 2: Separate prompt invalidation from output settings

**Files:**
- Modify: `src/components/preroll-prompt-editor.tsx`
- Test: `src/components/interactions.test.tsx`

1. Require AI regeneration for duration, subtitle mode, and character asset changes.
2. Allow model changes when every current segment fits the new model limit.
3. Allow resolution and aspect-ratio changes without AI regeneration.
4. Update aspect-ratio text in editable prompts deterministically.
5. Require regeneration when switching to a model whose segment limit is exceeded.

### Task 3: Persist submission settings

**Files:**
- Modify: `src/app/api/projects/[projectId]/workflow/script-action-schemas.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/update-video-prompt-command.ts`
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`

1. Accept generation settings when saving a prompt.
2. Validate model limits against existing segments.
3. Persist model, resolution, ratio, subtitle mode, duration, and segment limit in the confirmed plan.
4. Generate video only after the updated snapshot is saved.

### Task 4: Verify

1. Run targeted API and interaction tests.
2. Run TypeScript checks.
3. Run the full test suite and production build.
4. Verify script-specific navigation and parameter behavior in the browser without starting paid generation.
