# Preroll UI Action Simplification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify stages 05 and 06 so highlight playback, script review, prompt generation, editing, and video submission each have one clear action.

**Architecture:** Keep the existing script, prompt-plan, and production snapshot APIs. Change only component orchestration and presentation: AI prompt generation remains repeatable, video submission saves and confirms the current prompt before enqueueing, and stage 05 removes duplicated controls.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS, Vitest, Testing Library.

---

### Task 1: Simplify prompt actions

**Files:**
- Modify: `src/components/preroll-prompt-editor.tsx`
- Test: `src/components/interactions.test.tsx`

1. Add a persistent `AI 生成提示词` button.
2. Replace update/save/confirm states with one `生成视频` action.
3. Save and confirm the current prompt before video submission.
4. Keep generation disabled while a prompt job is active.

### Task 2: Expand the prompt editor

**Files:**
- Modify: `src/components/preroll-prompt-editor.tsx`
- Modify: `src/app/globals.css`

1. Remove the segment count, refresh icon, and visible segment heading.
2. Let prompt textareas fill the available editing pane.
3. Compact the generation parameter controls and action buttons.

### Task 3: Improve highlight navigation

**Files:**
- Modify: `src/components/pipeline-script-workspace.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/interactions.test.tsx`

1. Render the highlight video's first frame in each navigation card.
2. Allow direct playback with native video controls.
3. Keep highlight selection as a separate compact action.
4. Remove redundant generated-count/status copy where the stage already shows it.

### Task 4: Align script review actions

**Files:**
- Modify: `src/components/pipeline-script-workspace.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/interactions.test.tsx`

1. Put delete first for draft scripts.
2. Show edit or save as one contextual action.
3. Show either `确认脚本` or one `已确认` label, never both.
4. Give status/duration equal widths and generation times a stable width.

### Task 5: Verify

1. Run targeted interaction tests.
2. Run TypeScript checks.
3. Run the full test suite and production build.
4. Verify the updated stages in the browser without generating paid media.
