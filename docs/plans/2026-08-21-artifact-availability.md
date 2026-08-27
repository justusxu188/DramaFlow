# Artifact Availability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect expired generated-video URLs at runtime, exclude them from usable counts, and provide recovery actions.

**Architecture:** Use browser media events as the source of runtime availability evidence. A shared video component reports status upward; stage components aggregate counts and the workspace adjusts stage status without mutating historical artifacts.

**Tech Stack:** React 19, TypeScript, Testing Library, Vitest

---

### Task 1: Availability model and shared video

**Files:**
- Create: `src/lib/artifact-availability.ts`
- Create: `src/components/artifact-video.tsx`
- Create: `src/components/artifact-video.test.tsx`

Implement `checking`, `available`, `expired`, and `missing` states, retry
loading, fallback UI, and optional recovery command.

### Task 2: Pipeline stage integration

**Files:**
- Modify: `src/components/pipeline-highlight-stage.tsx`
- Modify: `src/components/preroll-post-production-controls.tsx`
- Modify: `src/components/pipeline-preroll-stage.tsx`
- Modify: `src/components/pipeline-final-outputs-stage.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`

Replace direct artifact videos, report status by artifact key, display stage
counts, disable post-production actions for unavailable sources, and wire
recovery navigation or regeneration.

### Task 3: Styling and regression tests

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/interactions.test.tsx`

Style checking and unavailable states. Verify expired media fallback and
recovery behavior.

### Task 4: Verification

Run typecheck, focused tests, all tests, production build, and browser checks.
