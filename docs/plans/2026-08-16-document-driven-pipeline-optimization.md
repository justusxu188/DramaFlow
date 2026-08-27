# Document-Driven Pipeline Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align the real short-drama production workflow with the reviewed Lark document, including configurable selling points and highlight output, three preroll production paths, and mandatory script review before Seedance generation.

**Architecture:** Extend the persisted creative settings into a typed production preset, snapshot the effective preset when a workflow starts, and propagate it through every queued job. Keep story analysis reusable, calculate MediaKit highlight recommendations from the analyzed source duration, stop automation at `scripts_ready`, then continue only after the user edits and confirms selected scripts.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, local JSON persistence, Vitest, Ark/Doubao, Seedream, Seedance, AI MediaKit, TOS.

---

### Task 1: Production preset and recommendation rules

**Files:**
- Create: `src/lib/production-config.ts`
- Modify: `src/lib/creative-settings-store.ts`
- Modify: `src/app/api/settings/creative/route.ts`
- Modify: `src/components/creative-settings-form.tsx`
- Test: `src/app/api/settings/creative/route.test.ts`

**Steps:**
1. Add typed enums and defaults for selling-point count, script count/style, character mode, and MediaKit highlight controls.
2. Add a pure recommendation helper that derives duration/count settings from analyzed source duration and the user's target mode.
3. Extend JSON persistence and Zod validation while preserving old settings files through default merging.
4. Expose the defaults in the settings UI and persist them explicitly.
5. Run the settings API tests and verify invalid ranges are rejected.

### Task 2: Workflow snapshot and MediaKit parameters

**Files:**
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`
- Modify: `src/lib/providers/types.ts`
- Modify: `src/lib/providers/mediakit.ts`
- Modify: `src/lib/pipeline-runner.ts`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`
- Test: `src/lib/providers/providers.test.ts`

**Steps:**
1. Accept a project-level production preset in `run_full` and merge it with global defaults.
2. Snapshot all selected assets and production parameters on the analysis job.
3. Use the configured selling-point count in Ark story-arc mining.
4. Calculate effective highlight settings after analysis and pass all supported controls to MediaKit.
5. Verify the provider request includes duration, output count, cut mode, storyboard, tags, opening hook, prompts, template, and hint.

### Task 3: Script review gate and preroll paths

**Files:**
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/lib/providers/ark.ts`
- Modify: `src/lib/pipeline-runner.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`

**Steps:**
1. Persist generated scripts as `draft` records with an editable video prompt.
2. Stop automatic execution after scripts are generated and mark the project as waiting for review.
3. Add API actions to update one script and confirm selected scripts.
4. Enqueue Seedance only for confirmed scripts.
5. For drama-character mode, use MediaKit clip snapshots as reference images; for new-character mode, create an asset image with Seedream first; for text-to-video mode, send no reference image.

### Task 4: Production workspace

**Files:**
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/components/pipeline-workspace.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/interactions.test.tsx`

**Steps:**
1. Add compact start controls for selling-point count, script count/style, character mode, and highlight target.
2. Show MediaKit's effective recommendation after analysis.
3. Present generated scripts as editable review items with explicit selection and confirmation.
4. Keep unconfirmed edits local until the user clicks save, and do not start downstream jobs on close/cancel.
5. Show the pipeline as waiting for script review rather than incorrectly reporting an active automatic run.

### Task 5: Verification

**Files:**
- Modify tests as needed without changing unrelated behavior.

**Steps:**
1. Run `PATH="/opt/homebrew/bin:$PATH" npm run typecheck`.
2. Run `PATH="/opt/homebrew/bin:$PATH" npm test -- --run`.
3. Run `PATH="/opt/homebrew/bin:$PATH" npm run build`.
4. Start or reuse the local Next.js server and verify the project workspace and health endpoint return HTTP 200.
5. Confirm no real provider call is made by merely editing a draft; only explicit script confirmation may enqueue Seedance work.
