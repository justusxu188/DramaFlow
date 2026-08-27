# Latest Preroll Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Put post-production actions beside the latest generated preroll video and keep the lower section limited to older versions.

**Architecture:** Reuse `PrerollPostProductionControls` in a toolbar presentation that does not render a second player. Let `PipelinePrerollStage` provide the latest-render actions to each prompt card, while the existing version list excludes the latest render for each script.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library

---

### Task 1: Add toolbar presentation

**Files:**
- Modify: `src/components/preroll-post-production-controls.tsx`
- Test: `src/components/preroll-post-production-controls.test.tsx`

1. Add a toolbar presentation that reuses the existing action, task, dialog, and persistence logic.
2. Accept the duration reported by the current preview player.
3. Verify the toolbar does not render a duplicate video player.

### Task 2: Attach actions to the latest preview

**Files:**
- Modify: `src/components/preroll-prompt-editor.tsx`
- Modify: `src/components/pipeline-preroll-stage.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/interactions.test.tsx`

1. Capture the current preview duration.
2. Render the post-production toolbar only when a latest usable render is displayed.
3. Bind actions, curation, composition navigation, availability, and regeneration to that exact render.

### Task 3: Remove latest-render duplication

**Files:**
- Modify: `src/components/pipeline-preroll-stage.tsx`
- Test: `src/components/interactions.test.tsx`

1. Exclude each script's latest render from the lower version list.
2. Rename the lower section to historical video versions.
3. Hide the section when no historical versions exist.

### Task 4: Validate

1. Run focused component tests.
2. Run `npm run typecheck`.
3. Run `npm test`.
4. Run `npm run build`.
5. Verify the latest preview toolbar on the live page without starting paid tasks.

### Completion

- The latest video preview now contains all five post-production actions.
- The lower section is limited to historical versions and excludes each script's latest render.
- TypeScript validation, 43 test files with 315 tests, and the production build passed.
- The live project page showed the toolbar on the 2026/08/23 16:25 render and reported no runtime console errors.
