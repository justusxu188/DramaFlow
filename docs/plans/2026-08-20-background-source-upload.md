# Background Source Upload Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users select one source video, multiple videos, or a folder while creating a project, then continue uploading after navigating away from the creation dialog.

**Architecture:** Add a client-side upload manager at the root layout so selected `File` objects and active XHR requests survive Next.js route changes. The creation dialog only gathers files and creates the project; after creation it enqueues source files, navigates immediately, and leaves progress, errors, and retries to a global floating upload panel.

**Tech Stack:** Next.js App Router, React 19 Context, TypeScript, TOS signed PUT uploads, XMLHttpRequest progress, Vitest, React Testing Library.

---

### Task 1: Global Upload Manager

**Files:**
- Create: `src/components/upload-manager.tsx`
- Modify: `src/app/layout.tsx`
- Test: `src/components/upload-manager.test.tsx`

1. Define source upload jobs with project metadata, local `File`, inferred episode number, progress, and status.
2. Upload queued files sequentially using duration probing, signed TOS PUT, and project asset registration.
3. Expose an enqueue function through React Context.
4. Render a persistent floating progress panel with collapse, close-completed, and retry-failed controls.
5. Mount the provider above all routes in the root layout.

### Task 2: Creation Dialog File Selection

**Files:**
- Modify: `src/components/project-dashboard.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/interactions.test.tsx`

1. Add separate file inputs for one file, multiple files, and folder selection.
2. Filter to MP4/MOV and deduplicate selected files.
3. Show selected count, total size, and removable file rows.
4. Create the project first, enqueue selected files, close the dialog, and navigate immediately.
5. Preserve empty-project creation when no files are selected.

### Task 3: Verification

1. Run the upload manager and dashboard interaction tests.
2. Run the complete Vitest suite.
3. Run TypeScript checking and the production build.
4. Verify selection modes, route navigation during upload, progress display, and mobile layout in the browser.
