# Production Plan Run Snapshot Isolation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure saving changed production settings never mutates the current production version and makes the next start create a new version.

**Architecture:** Keep editable settings in `productionPlans[productionEntry]` and keep the active `PipelineRun.productionConfig` immutable. The workspace continues returning both the current run snapshot and the saved next plan, allowing the client to compare them and resolve the correct start intent.

**Tech Stack:** TypeScript, React 19, Vitest, Testing Library

---

### Task 1: Add Run Snapshot Regression Coverage

**Files:**
- Modify: `src/lib/pipeline-store.test.ts`
- Modify: `src/components/interactions.test.tsx`

**Step 1:** Add a pure store test proving that saving a next plan leaves the active run configuration unchanged.

**Step 2:** Add an interaction test proving that a saved next plan differing in preroll type, relationship, resolution, and aspect ratio shows `开始新生产`.

**Step 3:** Run the focused tests and verify they fail against the current implementation.

### Task 2: Isolate The Saved Plan

**Files:**
- Modify: `src/lib/pipeline-store.ts`

**Step 1:** Extract a small plan-application helper that writes only `project.productionPlans[productionEntry]`.

**Step 2:** Remove the live project and run configuration synchronization from `saveNextProductionPlan`.

**Step 3:** Preserve the saved plan timestamp without changing the current run timestamp or snapshot.

### Task 3: Verify The Complete Flow

**Files:**
- Test: `src/lib/pipeline-store.test.ts`
- Test: `src/components/interactions.test.tsx`

**Step 1:** Run both focused test files.

**Step 2:** Run type checking, all tests, and the production build.

**Step 3:** Verify the real page shows `开始新生产` for the already-saved changed settings and keeps the displayed production-version time unchanged until the new run starts.
