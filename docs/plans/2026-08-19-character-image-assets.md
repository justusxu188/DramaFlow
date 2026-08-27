# Character Image Assets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a non-blocking character confirmation workflow whose confirmed images are stored under each project's `图像资产` folder and selected only when submitting drama-character video generation.

**Architecture:** Store project-level character bindings in the pipeline project snapshot and confirmed images as reusable `Asset` records. Build initial candidates from storyline snapshots, allow users to edit and confirm them independently of the production pipeline, and validate selected character assets only for the affected `generate_prerolls` request.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Prisma/MySQL with JSON fallback, TOS, Vitest, React Testing Library.

---

### Task 1: Character and Image Asset Data Contracts

**Files:**
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/lib/project-store.ts`
- Test: `src/lib/project-store.test.ts`

**Steps:**
1. Add `CharacterAppearance`, `CharacterBinding`, and project/run `characters` fields.
2. Add `ImageAsset` and a project-level `imageAssets` collection without changing source-video behavior.
3. Add `listImageAssets`, `createImageAsset`, and `getImageAssetsByIds`.
4. Write storage tests for local JSON and database-compatible mapping.
5. Run the focused tests and confirm they pass.

### Task 2: Project-Level TOS Folder

**Files:**
- Modify: `src/lib/tos.ts`
- Test: `src/lib/tos.test.ts`

**Steps:**
1. Add a `character_images` storage stage.
2. Map that stage to `<project>/图像资产` even when a run ID exists.
3. Keep existing run-stage and source paths unchanged.
4. Add path tests and run the focused suite.

### Task 3: Candidate Creation and Binding Mutations

**Files:**
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/lib/pipeline-runner.ts`
- Test: `src/lib/pipeline-runner.test.ts`

**Steps:**
1. Create initial non-blocking candidates from valid storyline snapshot images.
2. Persist candidates with stable appearance IDs and `candidate` status.
3. Add mutations to update, merge, split, and confirm character bindings.
4. On confirmation, transfer selected images to project-level TOS and create image assets.
5. Ensure candidate or transfer failures never fail analysis or downstream production.

### Task 4: Character Workflow API

**Files:**
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`

**Steps:**
1. Add actions for saving character details, merging, splitting, and confirming.
2. Validate all appearance and asset IDs belong to the current project.
3. Return precise errors without modifying unrelated bindings.
4. Keep `continue_production`, script generation, and prompt compilation independent of character status.
5. Run route tests.

### Task 5: Non-Blocking Character Workbench

**Files:**
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/interactions.test.tsx`

**Steps:**
1. Add an analysis-area summary showing confirmed and pending characters.
2. Add an expandable workbench for names, roles, appearance selection, merge, split, and confirmation.
3. Label the workflow clearly as optional until video generation.
4. Preserve all existing production buttons and their enabled states.
5. Add interaction tests and run them.

### Task 6: Video-Time Character Asset Selection

**Files:**
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`
- Modify: `src/lib/pipeline-runner.ts`
- Test: `src/components/interactions.test.tsx`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`

**Steps:**
1. Derive each script's unique character names from its shots.
2. Show confirmed project image assets for each character at video submission time.
3. Send per-script character asset selections in `generate_prerolls`.
4. Require selections only when `characterMode` is `drama_character` and the script has named characters.
5. Reject only the affected request and keep all other scripts and stages available.
6. Pass selected asset URLs to Seedance and remove automatic unlabelled snapshot fallback for submitted videos.

### Task 7: Library Folder

**Files:**
- Modify: `src/app/library/page.tsx`
- Modify: `src/app/globals.css`

**Steps:**
1. Add a project-level `图像资产` folder next to `源视频`.
2. Show image thumbnails, character names, source information, and preview links.
3. Keep production-run contents unchanged.
4. Verify empty and populated states.

### Task 8: Full Verification

**Files:**
- Verify all modified files.

**Steps:**
1. Run `PATH="/opt/homebrew/bin:$PATH" node_modules/.bin/vitest run`.
2. Run `PATH="/opt/homebrew/bin:$PATH" node_modules/.bin/tsc --noEmit`.
3. Run `PATH="/opt/homebrew/bin:$PATH" node_modules/.bin/next build`.
4. Start the development server on an available port.
5. Verify the analysis workbench, library folder, and video submission flow in desktop and mobile layouts.
