# Production Stage Workspace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the long production page into a stage-based workspace, add explicit production-plan persistence, and improve script-editor field sizing.

**Architecture:** Add a project-scoped production plan containing `productionConfig` and `prerollType`. The UI keeps an editable draft with dirty/saving/saved states; save, production start, and script regeneration all send the same draft to the server. A sticky seven-stage tab bar renders one stage panel at a time while preserving existing jobs and artifacts.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zod, local JSON/MySQL persistence, Vitest, Testing Library

---

### Task 1: Persist the complete production plan

**Files:**
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`

**Steps:**
1. Add `prerollType` to current project/run persistence.
2. Add `save_production_plan` workflow action.
3. Validate selected-source duration and target duration before save.
4. Save normalized config, linked recommendation, and preroll type.
5. Verify regeneration saves and enqueues the exact submitted draft.

### Task 2: Add production-plan save state

**Files:**
- Modify: `src/components/batch-pipeline-panel.tsx`
- Test: `src/components/interactions.test.tsx`

**Steps:**
1. Initialize the draft from the persisted project plan.
2. Mark the plan dirty whenever any production parameter changes.
3. Add `保存生产方案` with saving/saved/unsaved feedback.
4. Keep start and regenerate requests bound to the current draft.

### Task 3: Build the seven-stage workspace

**Files:**
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/interactions.test.tsx`

**Steps:**
1. Add sticky tabs for production plan, storyline, arcs, highlights, scripts, AI prerolls, and final outputs.
2. Derive each tab status from real jobs and artifacts.
3. Render only the active stage body.
4. Split highlight review from script review.
5. Preserve stage-specific controls and failure feedback.

### Task 4: Improve script editor field sizing

**Files:**
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/interactions.test.tsx`

**Steps:**
1. Apply compact sizing to title and duration.
2. Apply medium sizing to voiceover and transition.
3. Apply large default sizing to the video-generation prompt.
4. Keep shot fields responsive and resizable.

### Task 5: Verify

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all tests pass and the production build succeeds.

No Git commit is created because this workspace is not a Git repository and the user did not request a commit.
