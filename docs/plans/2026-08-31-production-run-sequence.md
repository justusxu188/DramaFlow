# Production Run Sequence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the random Run ID suffix in production-version labels with a stable, project-scoped, four-digit sequence beginning at `0001`.

**Architecture:** Add an optional persisted `sequence` field to `PipelineRun`. Normalize legacy runs deterministically by creation time, allocate each new run as the current project maximum plus one inside the serialized store mutation, expose the sequence through the workflow response, and format it in the production-version selector.

**Tech Stack:** Next.js 16, React 19, TypeScript, local JSON persistence, Vitest, Testing Library.

---

### Task 1: Cover Project-Scoped Run Numbering

**Files:**
- Modify: `src/lib/pipeline-store.test.ts`
- Test: `src/lib/pipeline-store.test.ts`

**Step 1: Write failing tests**

Add coverage proving that:

- legacy runs without a sequence are numbered by `createdAt` ascending;
- the first new run receives sequence `1`;
- later runs receive the project-local maximum plus one;
- separate projects each begin at sequence `1`.

**Step 2: Run the focused test**

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" /opt/homebrew/bin/npm test -- src/lib/pipeline-store.test.ts
```

Expected: FAIL because `PipelineRun.sequence` is not implemented.

### Task 2: Persist Stable Run Sequences

**Files:**
- Modify: `src/lib/pipeline-store.ts`

**Step 1: Extend the run schema**

Add:

```typescript
sequence?: number;
```

to `PipelineRun` for backward compatibility.

**Step 2: Normalize legacy runs**

Sort only unnumbered runs by `createdAt` and then `id`, assigning unused positive integers without changing valid persisted numbers.

**Step 3: Allocate new numbers atomically**

Inside both run creation mutations, set:

```typescript
sequence: nextPipelineRunSequence(project)
```

The existing mutation queue guarantees concurrent creations cannot receive the same number.

**Step 4: Run the focused data test**

Run the Task 1 command and expect PASS.

### Task 3: Display Four-Digit Versions

**Files:**
- Modify: `src/app/api/projects/[projectId]/workflow/get-workspace.ts`
- Modify: `src/components/pipeline-workspace-types.ts`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/components/interactions.test.tsx`

**Step 1: Expose the sequence**

Include `sequence` in each workflow run summary and add it to the client type.

**Step 2: Format the label**

Render production versions as:

```text
2026-08-31 00:21 · 0004
```

using `String(sequence).padStart(4, "0")`.

**Step 3: Verify the selector**

Add an interaction test asserting the four-digit label and the absence of the Run ID suffix.

### Task 4: Regression Verification

**Files:**
- Test: `src/lib/pipeline-store.test.ts`
- Test: `src/components/interactions.test.tsx`

**Step 1: Run focused tests**

```bash
PATH="/opt/homebrew/bin:$PATH" /opt/homebrew/bin/npm test -- src/lib/pipeline-store.test.ts src/components/interactions.test.tsx
```

**Step 2: Run type checking**

```bash
PATH="/opt/homebrew/bin:$PATH" /opt/homebrew/bin/npm run typecheck
```

Expected: all commands pass without modifying live pipeline data manually.
