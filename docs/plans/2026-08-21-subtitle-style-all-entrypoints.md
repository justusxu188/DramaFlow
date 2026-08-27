# Subtitle Style Across All Entry Points Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users configure MediaKit subtitle font, size, RGBA color, and position at every subtitle burn entry point.

**Architecture:** Add one shared subtitle style type, validator, defaults mapper, and reusable control component. AI preroll uses production config as its initial value; standalone post-production persists a local style snapshot and both submit explicit style fields.

**Tech Stack:** React 19, TypeScript 5.9, Next.js 16, Vitest, Testing Library

---

### Task 1: Add failing interaction tests

**Files:**
- Modify: `src/components/preroll-post-production-controls.test.tsx`
- Modify: `src/components/video-post-production-workspace.test.tsx`

Assert that changing all four style controls changes the `add_subtitles` start payload.

### Task 2: Add shared style model and controls

**Files:**
- Modify: `src/lib/subtitle-post-production.ts`
- Create: `src/components/subtitle-style-controls.tsx`
- Modify: `src/app/globals.css`

Define supported values once, validate RGBA input, and render compact reusable controls.

### Task 3: Integrate both burn surfaces

**Files:**
- Modify: `src/components/preroll-post-production-controls.tsx`
- Modify: `src/components/video-post-production-workspace.tsx`

Initialize, edit, validate, submit, and persist explicit subtitle style snapshots.

### Task 4: Verify

Run targeted tests, `npm run typecheck`, `npm test`, and `npm run build`; then verify both pages in the browser.
