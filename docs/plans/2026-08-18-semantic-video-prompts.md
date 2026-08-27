# Semantic Video Prompts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate concise Seedance prompts from semantic script segments without goal or frame-anchor fields.

**Architecture:** The prompt compiler receives script-derived semantic segments instead of duration-only buckets. It returns one global constraint object plus one executable prompt per segment. The worker submits only the global constraints and current segment prompt to Seedance, while the UI shows concise segment cards and hides advanced metadata by default.

**Tech Stack:** TypeScript, Zod, Next.js App Router, React, Vitest, Ark, Seedance.

---

### Task 1: Define the compact prompt contract

**Files:**
- Modify: `src/lib/preroll-prompts.ts`
- Modify: `src/lib/providers/ark.ts`
- Modify: `src/lib/pipeline-store.ts`
- Test: `src/lib/providers/providers.test.ts`

1. Replace frame-anchor output with `globalSettings` and `segments`.
2. Require each segment to contain duration, prompt, sound, and optional reference assets.
3. Keep normalization aliases for historical prompt plans.
4. Add tests for the compact JSON contract.

### Task 2: Build semantic segments from script shots

**Files:**
- Modify: `src/lib/pipeline-runner.ts`
- Test: `src/lib/pipeline-runner.test.ts`

1. Add a pure segment planner that groups adjacent shots by scene/action boundary.
2. Keep each segment within the provider duration limit and prefer 4–8 seconds.
3. Pass the planned shot content and durations to the prompt compiler.
4. Verify long actions split and short adjacent shots merge.

### Task 3: Submit concise Seedance prompts

**Files:**
- Modify: `src/lib/pipeline-runner.ts`
- Test: `src/lib/pipeline-runner.test.ts`

1. Compose each request from global style, character/scene consistency, the current segment prompt, sound, and a short negative constraint.
2. Stop submitting the entire compiled plan or repeated section labels.
3. Verify each segment receives only its own executable content.

### Task 4: Simplify prompt review UI

**Files:**
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/interactions.test.tsx`

1. Show a compact global summary.
2. Show each segment with duration and direct generation prompt.
3. Put sound, assets, and constraints in collapsed advanced details.
4. Remove goal and frame-anchor display.

### Task 5: Persist defaults and verify

**Files:**
- Modify: persisted creative settings through `/api/settings/creative`

1. Save the updated third-stage System Prompt.
2. Run all tests and TypeScript checks.
3. Run the production build.
