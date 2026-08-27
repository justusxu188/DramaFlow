# Pipeline Component and Workflow API Decomposition Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce the production workspace and Workflow API into explicit domain modules without changing public behavior, persistence, or request/response contracts.

**Architecture:** Keep `BatchPipelinePanel` as the stateful orchestration container while moving shared types and low-coupling stage views into dedicated modules. Keep the route as the HTTP boundary while moving schemas, GET snapshot assembly, and simple commands into workflow modules; complex generation commands remain in the route until their dependencies are isolated.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, Vitest, Testing Library.

---

### Task 1: Shared workspace domain types

**Files:**
- Create: `src/components/pipeline-workspace-types.ts`
- Modify: `src/components/batch-pipeline-panel.tsx`

Move `PipelineJob`, `PipelineData`, `FeaturedAsset`, and character asset types out of the stateful component. Export precise aliases for scripts, highlights, renders, and compositions.

### Task 2: Read-only stage components

**Files:**
- Create: `src/components/pipeline-analysis-stage.tsx`
- Create: `src/components/pipeline-story-arc-stage.tsx`
- Create: `src/components/pipeline-highlight-stage.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Test: `src/components/interactions.test.tsx`

Extract analysis, story arc, and high-light result rendering. Pass prepared data and callbacks; do not move state or network requests.

### Task 3: Workflow schemas

**Files:**
- Create: `src/app/api/projects/[projectId]/workflow/schema.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`

Move the discriminated action schema and supporting schemas. Export the inferred action type so handler modules share one validated contract.

### Task 4: Workflow GET handler

**Files:**
- Create: `src/app/api/projects/[projectId]/workflow/get-workspace.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`

Move workspace snapshot loading, prompt staleness mapping, asset projection, and response assembly into a dedicated query function.

### Task 5: Simple workflow commands

**Files:**
- Create: `src/app/api/projects/[projectId]/workflow/simple-commands.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`

Move retry, script update/delete, bulk delete, and character-binding commands. Return `NextResponse | null` so the route can continue to complex commands.

### Task 6: Verification

Run all tests, typecheck, build, and browser-check all four workspaces. Record resulting line counts and verify no request/response contract changes.
