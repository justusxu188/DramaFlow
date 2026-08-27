# Parallel Video Submission And Private Avatar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Submit up to ten Seedance video tasks per second without waiting for earlier tasks to finish, and allow project images to be registered as private virtual-avatar assets for reference video generation.

**Architecture:** Add a process-wide sliding-window limiter around Seedance task creation and change segmented preroll jobs to submit all segment tasks before polling results. Add a signed Volcengine Ark control-plane client for private avatar groups/assets, persist remote asset state in image metadata, and pass active assets to Seedance as `asset://<ASSET_ID>`.

**Tech Stack:** Next.js App Router, TypeScript, React, Vitest, Volcengine Ark Video Generation API, Volcengine Ark Assets API.

---

### Task 1: Video submission limiter

**Files:**
- Create: `src/lib/rate-limiter.ts`
- Modify: `src/lib/providers/ark.ts`
- Test: `src/lib/rate-limiter.test.ts`

1. Write tests proving the limiter permits ten immediate submissions and delays the eleventh until the next one-second window.
2. Implement a FIFO sliding-window limiter with configurable limit/window values.
3. Wrap `createPreroll` task creation with the shared ten-per-second limiter.
4. Run the limiter and provider tests.

### Task 2: Parallel segmented preroll execution

**Files:**
- Modify: `src/lib/pipeline-runner.ts`
- Test: `src/lib/pipeline-runner.test.ts`

1. Add tests for submitting every segment before polling any segment.
2. Store segment task IDs and completed segment URLs independently in the job input.
3. Poll unfinished tasks together, transfer completed outputs once, and concatenate only after all segments finish.
4. Preserve backward compatibility for jobs using the previous single `upstreamId` state.
5. Run pipeline runner tests.

### Task 3: Private virtual-avatar API client

**Files:**
- Create: `src/lib/ark-assets.ts`
- Modify: `src/lib/env.ts`
- Modify: `.env.example`
- Test: `src/lib/ark-assets.test.ts`

1. Add environment variables for Ark control-plane AK/SK, project name, and base URL.
2. Implement HMAC-SHA256 request signing for service `ark`, region `cn-beijing`.
3. Implement `CreateAssetGroup`, `CreateAsset`, and `GetAsset`.
4. Normalize `Processing`, `Active`, and `Failed` responses with complete provider errors.
5. Test canonical signing and response normalization without network access.

### Task 4: Persist and manage avatar status

**Files:**
- Modify: `src/lib/project-store.ts`
- Create: `src/app/api/projects/[projectId]/assets/avatar/route.ts`
- Create: `src/app/api/projects/[projectId]/assets/avatar/route.test.ts`

1. Extend image metadata with avatar group ID, asset ID, status, error, and update time.
2. Add a store method that patches image metadata in MySQL and local JSON modes.
3. Add an API action to register an image, reusing a character group's remote group when available.
4. Add a refresh action that queries remote preprocessing status.
5. Reject unavailable configuration and invalid project assets with clear errors.

### Task 5: Avatar controls and Seedance references

**Files:**
- Modify: `src/components/library-image-actions.tsx`
- Modify: `src/app/library/page.tsx`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`
- Modify: `src/lib/providers/types.ts`
- Modify: `src/lib/providers/ark.ts`
- Test: `src/components/library-asset-controls.test.tsx`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`

1. Add a compact image-card action for registration and status refresh.
2. Display processing, available, and failed states with full error text.
3. Include active avatar asset IDs in character selection snapshots.
4. Send active avatars as `asset://<ASSET_ID>` reference images; keep ordinary URLs for non-avatar images.
5. Prevent processing or failed assets from being submitted as private avatars.

### Task 6: Verification

1. Run `npm run typecheck`.
2. Run targeted tests for rate limiting, pipeline execution, avatar API, workflow API, and image actions.
3. Run `npm test -- --run`.
4. Run `npm run build`.
5. Confirm the existing development server returns the material library page.
