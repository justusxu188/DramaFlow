# Artifact Video Lazy Mount Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mount only the first stage video immediately and mount remaining artifact videos shortly before they enter the viewport.

**Architecture:** Extend the shared `ArtifactVideo` component with a one-way viewport activation state backed by `IntersectionObserver`. Keep artifact cards and controls mounted, pass deferred loading from each stage, and preserve undefined availability as `checking`.

**Tech Stack:** React 19, TypeScript, IntersectionObserver, Vitest, Testing Library, Next.js 16.

---

### Task 1: Test the shared lazy-mount behavior

**Files:**
- Modify: `src/components/artifact-video.test.tsx`

**Step 1: Add an `IntersectionObserver` mock**

Capture the observer callback, `observe`, and `disconnect` calls.

**Step 2: Add a failing deferred-mount test**

Render `ArtifactVideo` with `deferred`. Assert that the placeholder exists and
no `<video>` is mounted. Trigger an intersecting entry and assert that the video
mounts once.

**Step 3: Add a fallback test**

Remove `IntersectionObserver`, render a deferred video, and assert immediate
mounting.

**Step 4: Run the focused test**

Run:

```bash
export PATH="/opt/homebrew/bin:$PATH"
npx vitest run src/components/artifact-video.test.tsx
```

Expected: the new tests fail before implementation.

### Task 2: Implement one-way viewport activation

**Files:**
- Modify: `src/components/artifact-video.tsx`
- Modify: `src/app/globals.css`

**Step 1: Add lazy-mount props and container ref**

Add `deferred?: boolean` and a 300-pixel root margin. Initialize media mounting
to eager when `deferred` is false.

**Step 2: Observe deferred containers**

Create an observer only while media is deferred and not mounted. On the first
intersecting entry, mount the media and disconnect the observer. Fall back to
immediate mounting when the API is unavailable.

**Step 3: Render a stable placeholder**

Keep `data-availability="checking"` and show that the video will load when it
approaches the viewport. Preserve the existing missing and expired UI.

**Step 4: Run the focused test**

Run:

```bash
export PATH="/opt/homebrew/bin:$PATH"
npx vitest run src/components/artifact-video.test.tsx
```

Expected: all shared video tests pass.

### Task 3: Integrate all artifact stages

**Files:**
- Modify: `src/components/pipeline-highlight-stage.tsx`
- Modify: `src/components/pipeline-preroll-stage.tsx`
- Modify: `src/components/preroll-post-production-controls.tsx`
- Modify: `src/components/pipeline-final-outputs-stage.tsx`
- Modify: `src/components/interactions.test.tsx`

**Step 1: Mark only the first highlight video eager**

Use the first flattened artifact key as the eager key and defer every other
highlight video.

**Step 2: Pass deferred loading through preroll controls**

Add a controlled prop to `PrerollPostProductionControls`. The first completed
render is eager; later renders are deferred.

**Step 3: Mark only the newest final output eager**

The existing final-output sort keeps index zero as the newest composition.

**Step 4: Add interaction assertions**

Mock `IntersectionObserver` in the page interaction test and verify that stage
entry initially mounts one video while deferred artifact counts remain
`checking`.

### Task 4: Verify the complete change

**Files:**
- Verify: `src/components/artifact-video.tsx`
- Verify: all three artifact stages

**Step 1: Run TypeScript**

Run `npm run typecheck`.

**Step 2: Run focused and full tests**

Run the artifact video tests, interaction tests, and `npm test`.

**Step 3: Run the production build**

Run `npm run build`.

**Step 4: Browser-test the local app**

Verify highlighs, prerolls, and final outputs initially mount one video each.
Scroll near later cards and confirm additional videos mount without layout
shift, availability misclassification, or horizontal overflow.
