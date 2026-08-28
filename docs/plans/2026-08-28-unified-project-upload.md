# Unified Project Upload Implementation Plan

> **For Claude:** Implement this plan task-by-task with focused tests.

**Goal:** Replace the three visible project upload choices with one destination-aware upload area that accepts one or more files by picker and recursively accepts folders by drag and drop.

**Architecture:** The project dialog owns the selected destination and files. A small pure helper validates files and recursively reads dropped directory entries. The global upload manager receives the destination with each queued file, signs it for the matching TOS stage, and registers it through the existing project assets API.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library

---

### Task 1: Define upload targets and file filtering

**Files:**
- Modify: `src/components/upload-manager.tsx`
- Test: `src/components/upload-manager.test.ts`

1. Add `ProjectUploadTarget` for `source`, `character_image`, and `highlight`.
2. Add a pure filter that accepts video for source/highlight and JPG/PNG/WebP for image assets.
3. Add tests for type filtering, duplicate removal, and display naming.

### Task 2: Generalize background asset uploads

**Files:**
- Modify: `src/components/upload-manager.tsx`

1. Carry the selected asset target on every queued upload job.
2. Request a TOS upload URL using the matching `assetType`.
3. Probe duration only for video targets.
4. Register source, image, and highlight assets with their existing API payload contracts.
5. Show the destination folder in the background upload panel.

### Task 3: Build the unified project upload area

**Files:**
- Modify: `src/components/project-dashboard.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/project-dashboard-upload.test.tsx`

1. Add a three-option segmented destination control.
2. Replace the single/multiple/folder cards with one multi-file input.
3. Add drag state and recursive folder drop handling.
4. Clear incompatible selections when the destination changes.
5. Keep selected file review and removal before project creation.
6. Assert that each destination queues the correct asset type.

### Task 4: Verify

1. Run the focused upload tests.
2. Run TypeScript checking.
3. Run the full Vitest suite.
4. Run the production build.
