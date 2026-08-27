# Shared Artifact Run Isolation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep shared analysis, characters, and story arcs visible without assigning the source run identity or its downstream artifacts to another production entry.

**Architecture:** Extract workspace project resolution into a pure function. The resolver selects the latest run owned by the requested production entry, independently selects compatible shared analysis and arcs, and only exposes run-owned outputs when the target run exists.

**Tech Stack:** TypeScript 5.9, Next.js 16, Vitest 3

---

### Task 1: Lock run identity isolation with a regression test

**Files:**
- Test: `src/lib/pipeline-store.test.ts`

**Step 1:** Add a fixture containing one completed `full_drama` run with analysis, characters, arcs, highlights, scripts, renders, and compositions.

**Step 2:** Resolve the project for `uploaded_highlights` and assert that analysis, characters, and arcs are shared while `currentRunId` is undefined and entry-owned artifact arrays are empty.

**Step 3:** Run `npm test -- src/lib/pipeline-store.test.ts` and confirm the new test fails before implementation.

### Task 2: Separate shared artifacts from target run identity

**Files:**
- Modify: `src/lib/pipeline-store.ts:1433-1528`

**Step 1:** Extract the production-entry snapshot assembly into `resolvePipelineWorkspaceProject`.

**Step 2:** Set `currentRunId` only from the run matching the requested production entry.

**Step 3:** Preserve shared analysis, characters, and compatible arcs; keep highlights, scripts, renders, and compositions sourced only from the target run.

**Step 4:** Call the resolver from `getPipelineWorkspaceSnapshot` and rerun the targeted test.

### Task 3: Regression verification

**Files:**
- Verify: `src/lib/pipeline-store.ts`
- Verify: `src/lib/pipeline-store.test.ts`

**Step 1:** Run `npm run typecheck`.

**Step 2:** Run `npm test`.

**Step 3:** Run `npm run build`.

**Step 4:** Open the uploaded-highlight workflow and verify pending batch identity, shared analysis/arcs, waiting downstream stages, zero foreign jobs, and no horizontal overflow.
