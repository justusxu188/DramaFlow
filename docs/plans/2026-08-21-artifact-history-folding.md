# Artifact History Folding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep current and attention-required artifacts visible while collapsing lower-priority highlight and historical video cards.

**Architecture:** Add local expansion state to each stage. Highlights use a three-item initial window, prerolls group completed renders by script and fold old versions per group, and final outputs fold all but the newest composition. Existing availability maps determine which attention items bypass folding.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Next.js 16.

---

### Task 1: Add stage folding tests

**Files:**
- Create: `src/components/pipeline-artifact-folding.test.tsx`

**Step 1: Test highlight visibility**

Render five completed highlights. Assert that only three cards are visible,
click `展开更多高光（2）`, and assert that all five are visible.

**Step 2: Test attention visibility**

Mark a hidden highlight artifact expired. Assert that it remains visible even
while the normal list is collapsed.

**Step 3: Test final output history**

Render three compositions. Assert that only the newest is visible, expand
history, and assert that all three are visible.

**Step 4: Run tests and verify failure**

Run:

```bash
export PATH="/opt/homebrew/bin:$PATH"
npx vitest run src/components/pipeline-artifact-folding.test.tsx
```

Expected: fail because folding controls do not exist.

### Task 2: Fold highlights

**Files:**
- Modify: `src/components/pipeline-highlight-stage.tsx`
- Modify: `src/app/globals.css`

**Step 1: Add local expansion state**

Keep the first three highlights visible by default.

**Step 2: Bypass folding for attention items**

Always include non-completed highlights and highlights with an expired or
missing artifact.

**Step 3: Add one expand/collapse control**

Show the exact hidden count without changing availability totals.

### Task 3: Group and fold preroll versions

**Files:**
- Modify: `src/components/pipeline-preroll-stage.tsx`

**Step 1: Build script-owned render groups**

Sort each script group by `createdAt` descending and order groups by their
newest render.

**Step 2: Keep every newest render visible**

Render one current card for each script. Keep expired or missing historical
versions visible.

**Step 3: Add per-script history controls**

Track expanded script IDs in local state and expose exact history counts.

### Task 4: Fold final compositions

**Files:**
- Modify: `src/components/pipeline-final-outputs-stage.tsx`

**Step 1: Add local history expansion**

Keep the newest composition plus unavailable historical compositions visible.

**Step 2: Add final history control**

Expand and collapse only healthy historical compositions.

### Task 5: Complete verification

**Files:**
- Verify: all modified stage components and tests

**Step 1: Run focused tests**

Run folding, artifact video, interaction, and preroll control tests.

**Step 2: Run TypeScript and full tests**

Run `npm run typecheck` and `npm test`.

**Step 3: Run production build**

Run `npm run build`.

**Step 4: Browser-test**

Confirm three initial highlights, one preroll version per script, one current
final composition, working expand/collapse controls, lazy video mounting, no
hidden unavailable artifact, and no horizontal overflow.
