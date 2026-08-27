# Creative Workbench Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the fixed seven-stage production page with four focused creative work types whose navigation, configuration, steps, and actions match the actual job.

**Architecture:** Add stable creative-type routes under `/production`, pass the selected work type into the project workspace through a query parameter, and derive visible stages and configuration sections from that type. Keep the existing persisted production entry values for data compatibility while removing entry switching from an active project workspace. Build video post-production as a separate workspace shell rather than adding post-production controls to the ad-generation pipeline.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Lucide, Vitest, React Testing Library.

---

### Task 1: Creative Work Type Domain

**Files:**
- Create: `src/lib/creative-work-types.ts`
- Test: `src/lib/creative-work-types.test.ts`

1. Define the four route-safe work type IDs, labels, descriptions, production-entry mappings, and visible stages.
2. Add parsing helpers with a full-chain fallback.
3. Verify full-chain, highlight-preroll, and batch-highlight stage lists.

### Task 2: Expandable Sidebar and Workbench Index

**Files:**
- Modify: `src/components/sidebar.tsx`
- Modify: `src/components/sidebar.test.tsx`
- Modify: `src/app/production/page.tsx`
- Create: `src/app/production/[workType]/page.tsx`
- Modify: `src/app/globals.css`

1. Rename “创作流水线” to “创作工作台”.
2. Add an expandable second-level navigation for the four work types.
3. Build the workbench overview with four concise task entry rows and recent project access.
4. Build work-type project selection pages that link to project workspaces with `workType`.
5. Verify active and expanded navigation states.

### Task 3: Type-Aware Project Workspace

**Files:**
- Modify: `src/app/projects/[projectId]/page.tsx`
- Modify: `src/components/pipeline-workspace.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/components/interactions.test.tsx`
- Modify: `src/app/globals.css`

1. Parse `workType` at the project route.
2. Pass the selected type to the pipeline panel.
3. Remove production-entry cards from the plan configuration.
4. Synchronize the compatible persisted production entry from the route.
5. Render only the stages applicable to the selected work type.
6. Hide execution mode for batch highlight clipping.
7. Make batch highlight completion stop at saved highlight assets instead of presenting preroll/final output stages.
8. Verify each type’s visible stages and relevant configuration sections.

### Task 4: Video Post-Production Workspace

**Files:**
- Create: `src/components/video-post-production-workspace.tsx`
- Modify: `src/app/production/[workType]/page.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/video-post-production-workspace.test.tsx`

1. Create a focused project and source-material selector.
2. Present the planned post-production operations: subtitle removal, subtitles, title graphics, and transitions.
3. Keep unavailable processing actions explicitly disabled rather than simulating output.
4. Verify the workspace structure and operation labels.

### Task 5: Verification

1. Run focused navigation and pipeline interaction tests.
2. Run the complete Vitest suite.
3. Run TypeScript checking.
4. Run the Next.js production build.
5. Verify desktop and mobile navigation, work-type selection, and stage filtering in the browser.
