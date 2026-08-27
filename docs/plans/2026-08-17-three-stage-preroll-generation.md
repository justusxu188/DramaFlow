# Three-Stage Preroll Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a coherent three-stage pipeline from differentiated creative proposal, to reviewable video script, to confirmed-script-based Seedance prompt compilation.

**Architecture:** Keep three independently persisted System Prompts with explicit input/output contracts. Stages one and two run during script generation; stage three runs only after script confirmation, stores a structured prompt plan with source revision, and feeds segment-specific prompts to Seedance. Editing a draft invalidates any compiled prompt.

**Tech Stack:** Next.js App Router, React, TypeScript, Zod, Ark chat completions, Seedance task API, JSON/MySQL persistence, Vitest.

---

### Task 1: Expand the three prompt contracts

**Files:**
- Modify: `src/lib/preroll-prompts.ts`
- Modify: `src/lib/creative-settings-store.ts`
- Modify: `src/app/api/settings/creative/route.ts`
- Modify: `src/components/creative-settings-form.tsx`
- Test: `src/app/api/settings/creative/route.test.ts`

**Steps:**
1. Add a failing API test for `videoPromptSystemPrompt`.
2. Move the useful methods from the legacy prompt into stage-specific defaults without duplicating responsibilities.
3. Add the provided video-prompt method as the third default, adapted to the structured program contract.
4. Persist and restore all three prompts.
5. Replace the settings page's long vertical prompt list with three tabs, stage summaries, character counters, and one visible editor.

### Task 2: Add compiled prompt state and revision tracking

**Files:**
- Modify: `src/lib/pipeline-store.ts`
- Test: `src/lib/pipeline-runner.test.ts`

**Steps:**
1. Define `VideoPromptPlan`, segment prompt, compile status, source hash, and compile timestamp.
2. Create a deterministic script-content hash.
3. Save generated scripts with prompt status `pending`.
4. Invalidate the prompt plan whenever editable script content changes.
5. Add a dedicated store mutation for the worker to save compiled prompts on confirmed scripts.

### Task 3: Compile Seedance prompts after confirmation

**Files:**
- Modify: `src/lib/providers/ark.ts`
- Modify: `src/lib/pipeline-runner.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`
- Test: `src/lib/providers/providers.test.ts`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`

**Steps:**
1. Add a failing provider test for the structured video-prompt plan.
2. Implement `compileVideoPrompt` using the third System Prompt.
3. Pass the confirmed final script, transition anchor, character mode, references, model constraints, ratio, resolution, and semantic segment durations.
4. Change confirmation to enqueue a `compile_prompt` preroll phase.
5. Persist the plan, then requeue the same job for Seedance segments.
6. Submit each segment's own prompt and continuity anchors instead of repeating the whole script prompt.

### Task 4: Clarify the review and generation UI

**Files:**
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/interactions.test.tsx`

**Steps:**
1. Rename confirmation to “确认脚本并编译视频提示词”.
2. Show per-script states: `待确认`, `待编译`, `编译中`, `提示词已就绪`, `生成中`, `已生成`, `失败`.
3. Explain the three-stage handoff in a compact step strip.
4. Remove editable machine-compiled prompt content from the draft script editor.
5. Show the compiled prompt read-only after confirmation.

### Task 5: Persist defaults and verify the real flow

**Files:**
- Persist through API: `data/creative-settings.json`

**Steps:**
1. Save all three improved defaults through `/api/settings/creative`.
2. Confirm a real script and verify prompt compilation precedes Seedance submission.
3. Run focused tests, full tests, TypeScript, and production build.
