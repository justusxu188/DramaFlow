# Highlight Preroll Story Context Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate highlight-preroll scripts from real story and payoff understanding, using project episodes when available and complete highlight understanding otherwise.

**Architecture:** The workflow chooses one immutable story-context source when a run starts. Original episodes take precedence and reuse project-level analysis when available; otherwise the selected highlights become the full analysis input. Both paths persist real storyline analysis and story arcs, then merge them with each selected highlight's opening-ten-second transition and visual analysis.

**Tech Stack:** Next.js App Router, TypeScript, MediaKit storyline analysis, Ark story-arc and preroll generation, Vitest.

---

### Task 1: Replace synthetic uploaded-highlight context

**Files:**
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`

1. Detect whether the project has source episodes.
2. Load reusable full-drama analysis and arcs when episodes exist.
3. Start a run from shared artifacts when reusable context exists.
4. Otherwise enqueue a real `analysis` job using episode URLs or complete selected-highlight URLs.
5. Include an immutable selected-highlight snapshot in the job input.

### Task 2: Continue uploaded highlights after story analysis

**Files:**
- Modify: `src/lib/pipeline-runner.ts`
- Test: `src/lib/pipeline-runner.test.ts`

1. Allow analysis jobs to use explicit highlight URLs even when a project has no source episodes.
2. Preserve the uploaded-highlight snapshot when analysis enqueues arc mining.
3. After arc mining, bind every selected highlight to a real story arc.
4. Enqueue opening-ten-second transition analysis without calling MediaKit highlight generation.

### Task 3: Merge all relevant story arcs into script generation

**Files:**
- Modify: `src/lib/providers/ark.ts`
- Modify: `src/lib/pipeline-runner.ts`
- Test: `src/lib/providers/providers.test.ts`

1. Pass all current-run story arcs to preroll script generation.
2. Include the complete story/payoff context in both concept and script prompts.
3. Keep the current highlight's opening-ten-second anchor as the direct continuity constraint.

### Task 4: Explain the source in the UI

**Files:**
- Modify: `src/components/batch-pipeline-panel.tsx`
- Test: `src/components/interactions.test.tsx`

1. When source episodes exist, state that project story understanding and payoff arcs are reused.
2. When source episodes do not exist, state that selected highlights are understood in full.
3. Explain that both paths also analyze each highlight's opening ten seconds.

### Task 5: Verify

1. Run route, runner, provider, and interaction tests.
2. Run the full test suite.
3. Run TypeScript checks and production build.
4. Verify both source-present and source-absent UI states in the browser.
