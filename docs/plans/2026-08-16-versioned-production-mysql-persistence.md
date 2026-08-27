# Versioned Production and MySQL Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make production controls unambiguous, organize source and generated assets by project and immutable production run, and persist business data in MySQL without losing existing local JSON data.

**Architecture:** MySQL stores projects, source assets, production runs, stage artifacts, jobs, settings, and searchable metadata. TOS stores binary media under deterministic project/run prefixes. Local JSON remains a fallback and migration source, but MySQL becomes the primary store only after schema synchronization and import verification succeed.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma 6, MySQL, TOS, Vitest.

---

### Task 1: Correct Production Controls

**Files:**
- Modify: `src/lib/production-config.ts`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/components/creative-settings-form.tsx`
- Test: `src/components/interactions.test.tsx`

**Steps:**
1. Add `custom` to the script style enum and render a single editable combobox.
2. Keep both calculated high-light fields read-only after choosing a control mode.
3. Add an explicit edit action for the controlling value instead of exposing two editable fields.
4. Verify custom style and calculated value behavior with interaction tests.

### Task 2: Add Project and Run Storage Prefixes

**Files:**
- Modify: `src/lib/tos.ts`
- Modify: `src/app/api/uploads/sign/route.ts`
- Modify: `src/lib/pipeline-runner.ts`
- Test: `src/lib/providers/providers.test.ts`

**Steps:**
1. Generate safe project folder names from project ID and project name.
2. Store uploaded source media under `AIGCAdv/projects/{project-folder}/sources/`.
3. Store generated media under `AIGCAdv/projects/{project-folder}/runs/{run-id}/{stage}/`.
4. Preserve object keys and public URLs in persistent metadata.

### Task 3: Model Immutable Production Runs

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/lib/pipeline-runner.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`

**Steps:**
1. Add `ProductionRun`, `RunArtifact`, and run-linked job fields.
2. Create a run when analysis starts and attach the selected source snapshot.
3. Retain all previous runs and their analysis, arcs, scripts, highlights, renders, and compositions.
4. Route every downstream stage to the originating run.

### Task 4: Implement MySQL Repositories

**Files:**
- Modify: `src/lib/project-store.ts`
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/lib/creative-settings-store.ts`
- Modify: `src/lib/db.ts`

**Steps:**
1. Use MySQL as the primary repository when `PERSISTENCE_MODE=mysql`.
2. Persist pipeline jobs and run artifacts transactionally.
3. Persist creative settings in MySQL.
4. Fall back to local JSON only when MySQL is unavailable, without silently mixing partial writes.

### Task 5: Import Existing Local Data

**Files:**
- Create: `scripts/migrate-local-to-mysql.mjs`
- Modify: `package.json`

**Steps:**
1. Read project, pipeline, and creative settings JSON files.
2. Upsert projects, assets, runs, jobs, artifacts, and settings.
3. Produce counts before and after import.
4. Switch `PERSISTENCE_MODE` only after verification succeeds.

### Task 6: Group the Library by Project and Run

**Files:**
- Modify: `src/app/library/page.tsx`
- Modify: `src/app/globals.css`

**Steps:**
1. Render source files under project-named groups.
2. Render generated artifacts under run folders with timestamps and stage labels.
3. Keep direct links to the project and TOS media.
4. Ensure mobile and desktop layouts remain readable.

### Task 7: Synchronize and Verify

**Commands:**
- `npx prisma db push`
- `npm run migrate:mysql`
- `npm run typecheck`
- `npm test -- --run`
- `npm run build`

**Steps:**
1. Verify TCP and Prisma access with the application user.
2. Push the schema using the authorized database account.
3. Import existing local data and compare record counts.
4. Run type checking, unit tests, production build, API health checks, and page checks.
