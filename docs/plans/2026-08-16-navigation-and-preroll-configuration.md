# Navigation And Preroll Configuration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the four sidebar entries into distinct work pages and let users control real preroll-script generation through a workflow preset and a persisted custom system prompt.

**Architecture:** Add dedicated `/production`, `/library`, and `/tasks` routes backed by existing real project/workflow APIs. Store creative settings in a local JSON store exposed through `/api/settings/creative`; snapshot the selected preroll type and effective system prompt into the analysis job, propagate them to script jobs, and pass them into Ark while retaining mandatory structural and factual guardrails.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zod, local JSON persistence, Vitest, Testing Library.

---

### Task 1: Navigation contract tests

**Files:**
- Modify: `src/components/interactions.test.tsx`
- Create: `src/components/sidebar.test.tsx`

**Steps:**
1. Assert each sidebar item points to a distinct route.
2. Assert active navigation follows the current route.
3. Add page-level smoke coverage for production, library, and task views.
4. Run tests and confirm failures before implementation.

### Task 2: Dedicated work pages

**Files:**
- Modify: `src/components/sidebar.tsx`
- Create: `src/app/production/page.tsx`
- Create: `src/app/library/page.tsx`
- Create: `src/app/tasks/page.tsx`
- Create: `src/components/production-center.tsx`
- Create: `src/components/global-library.tsx`
- Create: `src/components/task-center.tsx`
- Modify: `src/components/project-dashboard.tsx`
- Modify: `src/app/globals.css`

**Steps:**
1. Replace hash/project-dependent sidebar links with fixed routes.
2. Keep project center focused on project creation and project status.
3. Show all real projects and production state on the production page.
4. Aggregate all project assets on the library page with project filters and preview links.
5. Aggregate all workflow jobs on the task page with status and project context.

### Task 3: Creative settings persistence

**Files:**
- Create: `src/lib/creative-settings-store.ts`
- Create: `src/app/api/settings/creative/route.ts`
- Create: `src/components/creative-settings-form.tsx`
- Modify: `src/app/settings/page.tsx`
- Test: `src/app/api/settings/creative/route.test.ts`

**Steps:**
1. Define settings for `prerollScriptSystemPrompt`.
2. Persist settings atomically in `data/creative-settings.json`.
3. Add GET/PUT API validation and length limits.
4. Add an editable settings form with save/reset behavior.

### Task 4: Workflow creative controls

**Files:**
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/components/pipeline-workspace.tsx`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`
- Modify: `src/lib/pipeline-runner.ts`
- Modify: `src/lib/providers/ark.ts`

**Steps:**
1. Present preroll type choices before starting the full workflow.
2. Submit the selected type with source asset IDs.
3. Resolve and snapshot the current custom system prompt at workflow start.
4. Propagate type and prompt through analysis, arc, highlight, transition, and script jobs.
5. Let the selected type override model-derived arc defaults for script generation.
6. Use the custom prompt as the creative system instruction, followed by mandatory JSON, evidence, duration, and transition constraints.

### Task 5: Verification

**Steps:**
1. Run `npm run typecheck`.
2. Run `npm test -- --run`.
3. Run `npm run build`.
4. Verify `/`, `/production`, `/library`, `/tasks`, and `/settings` return HTTP 200.
5. Verify the development server and Worker remain running.
