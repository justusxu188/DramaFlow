# Workflow API Command Decomposition Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce the remaining Workflow route to a thin HTTP boundary without changing request contracts, response payloads, persistence, or task execution behavior.

**Architecture:** Group validated actions into domain command handlers with explicit type guards. Keep shared prompt/configuration helpers dependency-free, and preserve the route-level project lookup and error boundary.

**Tech Stack:** Next.js 16, TypeScript, Zod, Vitest.

---

### Task 1: Shared Workflow helpers

**Files:**
- Create: `src/app/api/projects/[projectId]/workflow/helpers.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`

Move video Prompt snapshot selection and high-light duration validation into reusable functions.

### Task 2: Post-production and production-plan commands

**Files:**
- Create: `src/app/api/projects/[projectId]/workflow/post-production-commands.ts`
- Create: `src/app/api/projects/[projectId]/workflow/production-plan-command.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`

Move preroll render updates, composition submission, and production-plan validation/persistence.

### Task 3: Script and preroll commands

**Files:**
- Create: `src/app/api/projects/[projectId]/workflow/script-commands.ts`
- Create: `src/app/api/projects/[projectId]/workflow/preroll-command.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`

Move script regeneration, confirmation, Prompt compilation, and Seedance preroll submission.

### Task 4: Production-run commands

**Files:**
- Create: `src/app/api/projects/[projectId]/workflow/production-run-command.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`

Move shared-artifact continuation, uploaded-highlight startup, batch-highlight startup, and original-source startup.

### Task 5: Verification

Run Workflow route tests after every handler migration. Finish with TypeScript, all tests, production build, and final route line-count verification.
