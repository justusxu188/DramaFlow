# Short Drama Ad Studio Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a production-shaped web application for generating short-drama ad creatives from source episodes, including pre-roll hooks, highlight edits, review, and export.

**Architecture:** Use a Next.js App Router application for the UI and server APIs, Prisma for MySQL persistence, and provider adapters for Ark, Seedream, Seedance, TOS, and MediaKit. A mock provider keeps local development deterministic; production credentials enable real upstream calls without exposing secrets to the browser.

**Tech Stack:** Next.js, React, TypeScript, Prisma, Zod, Vitest, Lucide icons, CSS Modules/global CSS.

---

### Task 1: Bootstrap and domain contracts

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `src/lib/domain.ts`
- Test: `src/lib/domain.test.ts`

**Step 1:** Write tests for production stages, hook types, highlight modes, job status normalization, and image size mappings.

**Step 2:** Run `npm test -- src/lib/domain.test.ts` and verify it fails because the module does not exist.

**Step 3:** Implement typed constants, Zod schemas, display labels, and 2K/4K image size mappings.

**Step 4:** Run `npm test -- src/lib/domain.test.ts` and verify it passes.

### Task 2: Persistence and secure configuration

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/env.ts`
- Create: `src/lib/db.ts`
- Create: `.env.example`
- Create: `.gitignore`

**Step 1:** Define users, projects, assets, scripts, jobs, timeline versions, and outputs with project ownership and timestamps.

**Step 2:** Validate server-only environment variables with Zod and expose only non-secret feature flags.

**Step 3:** Add a Prisma singleton and ensure the application can run in mock mode without a live database.

**Step 4:** Run `npm run typecheck`.

### Task 3: Provider adapters

**Files:**
- Create: `src/lib/providers/types.ts`
- Create: `src/lib/providers/mock.ts`
- Create: `src/lib/providers/ark.ts`
- Create: `src/lib/providers/mediakit.ts`
- Create: `src/lib/providers/index.ts`
- Test: `src/lib/providers/providers.test.ts`

**Step 1:** Write provider contract tests for analysis, script generation, Seedance task creation/status, scene segmentation, and concatenation.

**Step 2:** Implement deterministic mock results.

**Step 3:** Implement Ark requests for `/chat/completions`, `/images/generations`, and `/contents/generations/tasks`.

**Step 4:** Implement MediaKit requests for `/tools/segment-scenes`, `/tools/concat-video`, and `/tasks/{id}`.

**Step 5:** Ensure Authorization headers and upstream errors never enter client payloads.

### Task 4: Application APIs

**Files:**
- Create: `src/app/api/projects/route.ts`
- Create: `src/app/api/projects/[projectId]/pipeline/route.ts`
- Create: `src/app/api/jobs/[jobId]/route.ts`
- Create: `src/app/api/health/route.ts`
- Test: `src/app/api/api.test.ts`

**Step 1:** Validate create-project and create-pipeline-job payloads with Zod.

**Step 2:** Return stable mock data when `PROVIDER_MODE=mock`.

**Step 3:** Return sanitized errors with request correlation IDs.

**Step 4:** Run targeted API tests.

### Task 5: Product shell and dashboard

**Files:**
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/components/icons.tsx`
- Create: `src/components/sidebar.tsx`
- Create: `src/components/project-dashboard.tsx`

**Step 1:** Build a dark editorial shell with a narrow sidebar, project header, status cards, project rows, and activity feed.

**Step 2:** Use real icons and accessible labels; avoid decorative gradients and excessive rounded cards.

**Step 3:** Verify responsive behavior at desktop and tablet widths.

### Task 6: Pipeline workspace

**Files:**
- Create: `src/app/projects/[projectId]/page.tsx`
- Create: `src/components/pipeline-workspace.tsx`
- Create: `src/components/video-preview.tsx`
- Create: `src/components/script-editor.tsx`
- Create: `src/components/timeline.tsx`

**Step 1:** Implement the seven-stage progress rail.

**Step 2:** Implement hook strategy controls, script variants, storyboard shots, highlight modes, and generation settings.

**Step 3:** Implement the 9:16 preview and three-track business timeline.

**Step 4:** Connect generation actions to the pipeline API and display queued/running/completed states.

### Task 7: Verification

**Files:**
- Modify: `README.md`

**Step 1:** Document setup, mock mode, real provider environment variables, database migration, and credential rotation.

**Step 2:** Run `npm test`.

**Step 3:** Run `npm run typecheck`.

**Step 4:** Run `npm run build`.

**Step 5:** Start the app and smoke-test the dashboard, project workspace, and health API.
