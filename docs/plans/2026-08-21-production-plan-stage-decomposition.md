# Production Plan Stage Decomposition Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the complete production-plan UI out of `BatchPipelinePanel` without changing configuration, validation, save, or start behavior.

**Architecture:** Keep `BatchPipelinePanel` as the stateful workflow orchestrator and API boundary. Add a controlled `PipelineProductionPlanStage` that receives normalized values, derived validation guidance, and callbacks from the parent.

**Tech Stack:** Next.js 16, React 19, TypeScript, Testing Library, Vitest

---

### Task 1: Define the controlled production-plan component

**Files:**
- Create: `src/components/pipeline-production-plan-stage.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`

**Step 1: Preserve the existing behavior contract**

Use the existing interaction tests covering:

- Source and uploaded-highlight selection.
- Editable target duration and output count.
- Model, resolution, ratio, subtitle, and expression settings.
- Dirty, saved, and default plan states.
- `save_production_plan` and `run_full` request payloads.

**Step 2: Create the component Props**

Define explicit Props for `ProductionConfig`, workflow flags, source/highlight
summaries, duration recommendations, dirty/saving state, and callbacks. Do not
pass parent setters into the child.

**Step 3: Move the complete plan JSX**

Move the current `activeStage === "plan"` rendering block into the new
component. Replace direct state mutations with:

```typescript
onConfigChange("videoRatio", ratio);
onTargetDurationInputChange(rawValue);
onTargetCountInputChange(rawValue);
onSave();
```

**Step 4: Render the component from the parent**

Keep the parent callouts and API error display unchanged. Pass only derived
values and stable callbacks.

**Step 5: Run targeted tests**

Run:

```bash
export PATH="/opt/homebrew/bin:$PATH"
npx vitest run src/components/interactions.test.tsx
```

Expected: all component interaction tests pass.

### Task 2: Verify type and production behavior

**Files:**
- Modify only files needed to fix migration defects.

**Step 1: Run TypeScript**

Run:

```bash
export PATH="/opt/homebrew/bin:$PATH"
npx tsc --noEmit
```

Expected: no TypeScript errors.

**Step 2: Run the complete test suite**

Run:

```bash
export PATH="/opt/homebrew/bin:$PATH"
npm test -- --run
```

Expected: all tests pass.

**Step 3: Run the production build**

Run:

```bash
export PATH="/opt/homebrew/bin:$PATH"
npm run build
```

Expected: Next.js production build succeeds.

**Step 4: Commit**

The current workspace is not a Git repository, so no commit is created here.
In a Git checkout, stage the two component files and these plan documents in a
new commit.
