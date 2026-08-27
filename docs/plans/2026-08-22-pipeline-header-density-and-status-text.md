# Pipeline Header Density And Status Text Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify the production-stage header height, keep the production version right-aligned, remove the redundant settings separator, and make stage status text fully readable.

**Architecture:** Keep the existing pipeline component structure and adjust only header element order, status-label formatting, and scoped CSS. Preserve stage state semantics and accessibility labels while allowing compact two-line status rendering where space is limited.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS, Vitest, Testing Library

---

### Task 1: Lock Header And Status Semantics

**Files:**
- Modify: `src/components/interactions.test.tsx`

**Step 1:** Add assertions that the production version is the final header item and stage status labels expose their full text.

**Step 2:** Run the focused interaction test and confirm the new assertions fail.

### Task 2: Implement The Compact Pipeline Header

**Files:**
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/components/workflow-stage-navigation.tsx`
- Modify: `src/app/globals.css`

**Step 1:** Render plan actions before the production-version summary.

**Step 2:** Format multi-metric status labels with compact separators and expose the complete value through `title`.

**Step 3:** Give all header states the same compact minimum height and constrain plan buttons to 32px.

**Step 4:** Allow stage status text to wrap to two lines without ellipsis.

**Step 5:** Remove only the top border from `.pipeline-start-settings`.

### Task 3: Verify

**Files:**
- Test: `src/components/interactions.test.tsx`

**Step 1:** Run the focused interaction test.

**Step 2:** Run TypeScript checking, the full test suite, and the production build.

**Step 3:** Verify the real page at desktop and narrow widths for equal header height, right-aligned version placement, complete stage status text, and horizontal overflow.
