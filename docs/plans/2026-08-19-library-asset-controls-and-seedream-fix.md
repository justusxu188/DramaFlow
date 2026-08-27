# Library Asset Controls and Seedream Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix Seedream 5.0 Pro image generation and improve library asset viewing, deletion, form wording, and project folding.

**Architecture:** Keep model-specific Ark request differences inside the provider adapter. Add one typed asset deletion operation shared by MySQL and local JSON persistence, expose it through the existing project assets route, and use small client components for destructive controls, image preview, and project disclosure while preserving server-rendered library content.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Prisma, Vitest, React Testing Library.

---

### Task 1: Seedream 5.0 Pro Request Compatibility

**Files:**
- Modify: `src/lib/providers/ark.ts`
- Test: `src/lib/providers/providers.test.ts`

1. Add a provider test asserting the Pro request omits `sequential_image_generation`.
2. Keep the Lite request behavior covered separately.
3. Build the request body conditionally by selected image model.
4. Run the provider tests.

### Task 2: Persistent Asset Deletion

**Files:**
- Modify: `src/lib/project-store.ts`
- Modify: `src/app/api/projects/[projectId]/assets/route.ts`
- Test: `src/app/api/projects/[projectId]/assets/route.test.ts`

1. Add a typed deletion schema accepting `assetId` and `assetType`.
2. Implement project-scoped deletion for source, character image, and uploaded highlight assets in MySQL and local JSON.
3. Return `404` for missing or mismatched assets.
4. Add route tests for successful and missing deletion.

### Task 3: Library Client Controls

**Files:**
- Create: `src/components/library-asset-controls.tsx`
- Create: `src/components/library-project-section.tsx`
- Modify: `src/app/library/page.tsx`
- Modify: `src/app/globals.css`

1. Add a confirmed delete icon button that calls the deletion route and refreshes the page.
2. Add a click-to-preview image button and accessible image lightbox.
3. Add a project disclosure component whose folder button expands and collapses the project content.
4. Place delete controls on source, image, and user-uploaded highlight items.
5. Keep generated MediaKit outputs read-only because they are run artifacts rather than project assets.
6. Add responsive styles and verify no horizontal overflow.

### Task 4: Character Look Form Copy

**Files:**
- Modify: `src/components/library-asset-uploader.tsx`
- Test: `src/components/library-asset-uploader.test.tsx`

1. Make the baseline prompt option disabled and hidden so it behaves as a placeholder instead of a selectable list item.
2. Rename `妆造要求` to `输入生成图片提示词`.
3. Update validation text and component tests.

### Task 5: Verification

1. Run `node_modules/.bin/vitest run`.
2. Run `node_modules/.bin/tsc --noEmit`.
3. Run `node_modules/.bin/next build`.
4. Verify image preview, deletion confirmation, project folding, and form behavior in the browser on desktop and mobile.
