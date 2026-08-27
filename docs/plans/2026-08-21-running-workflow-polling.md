# Running Workflow Polling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Poll workflow data only while the current workspace has queued or running jobs, with background pause and immediate focus recovery.

**Architecture:** Add a dedicated React hook that owns the five-second timer, document visibility, window focus, and polling request deduplication. Keep data fetching and all explicit post-write refreshes in `BatchPipelinePanel`, which supplies a current-workspace active-job boolean.

**Tech Stack:** React 19, TypeScript, Vitest fake timers, Testing Library, Next.js 16.

---

### Task 1: Test polling behavior

**Files:**
- Create: `src/components/use-workspace-polling.test.tsx`

**Step 1: Test initial and idle behavior**

Render the hook with `hasRunningJobs=false`. Verify one initial refresh and no
additional refresh after advancing time.

**Step 2: Test active polling**

Render with `hasRunningJobs=true`, advance five seconds, and verify one polling
refresh.

**Step 3: Test page visibility and focus**

Set `document.visibilityState` to hidden and verify timers stop. Dispatch a
visible transition and a focus event and verify immediate refreshes.

**Step 4: Test in-flight deduplication**

Keep one polling promise unresolved, advance multiple intervals, and verify no
overlapping polling request is created.

**Step 5: Run the focused test**

Run:

```bash
export PATH="/opt/homebrew/bin:$PATH"
npx vitest run src/components/use-workspace-polling.test.tsx
```

Expected: fail because the hook does not exist.

### Task 2: Implement the polling hook

**Files:**
- Create: `src/components/use-workspace-polling.ts`

**Step 1: Track document visibility**

Subscribe to `visibilitychange` and store whether the document is visible.

**Step 2: Coordinate polling refreshes**

Use a ref-based in-flight guard around timer, visibility, and focus refreshes.

**Step 3: Schedule only active work**

Create a five-second interval only when the page is visible and
`hasRunningJobs=true`.

**Step 4: Preserve explicit synchronization**

Perform one refresh on mount, refresh on visible transition, and refresh on
window focus without creating an idle interval.

### Task 3: Integrate the workspace panel

**Files:**
- Modify: `src/components/batch-pipeline-panel.tsx`

**Step 1: Remove the fixed interval**

Delete the unconditional five-second polling effect.

**Step 2: Derive the active-job signal**

Use current-workspace latest jobs with `queued` or `running` status.

**Step 3: Invoke the polling hook**

Pass `refresh` and the active-job boolean after workspace job scoping.

### Task 4: Verify the complete change

**Files:**
- Verify: polling hook, panel, and interaction tests

**Step 1: Run focused tests and TypeScript**

Run the polling hook and interaction tests, then `npm run typecheck`.

**Step 2: Run all tests**

Run `npm test`.

**Step 3: Build**

Run `npm run build`.

**Step 4: Browser-test**

Confirm an idle page produces no periodic workflow request, manual refresh still
works, and a focus/visibility recovery fetches the workspace immediately.
