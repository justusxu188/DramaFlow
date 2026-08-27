# Script And Preroll Component Decomposition Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the AI preroll script workspace, script editor, and generated-preroll review stage out of `BatchPipelinePanel` without changing workflow behavior.

**Architecture:** Keep API commands, polling, Run selection, and workspace job scoping in `BatchPipelinePanel`. Move controlled UI domains and their local presentation state into dedicated components.

**Tech Stack:** Next.js 16, React 19, TypeScript, Testing Library, Vitest

---

### Task 1: Extract the script editor

**Files:**
- Create: `src/components/pipeline-script-editor-modal.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Test: `src/components/interactions.test.tsx`

**Steps:**
1. Move timeline parsing, visual-field normalization, dialogue parsing, and
   textarea sizing into the editor module.
2. Keep the edited script as a local draft.
3. Return the complete draft through `onSave(script)`.
4. Run `npm test -- --run src/components/interactions.test.tsx`.

### Task 2: Extract the script workspace

**Files:**
- Create: `src/components/pipeline-script-workspace.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Test: `src/components/interactions.test.tsx`

**Steps:**
1. Move highlight navigation, script cards, prompt details, character image
   selectors, and bulk actions.
2. Move expanded-script and editor-open state into the component.
3. Keep selected script IDs and character selections controlled by the parent.
4. Pass command callbacks for generate, compile, delete, edit, and video
   submission.
5. Run the interaction suite and TypeScript.

### Task 3: Extract the generated-preroll stage

**Files:**
- Create: `src/components/pipeline-preroll-stage.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Test: `src/components/interactions.test.tsx`
- Test: `src/components/preroll-post-production-controls.test.tsx`

**Steps:**
1. Move running-version status, rendered version list, empty state, curation,
   and `PrerollPostProductionControls` composition.
2. Preserve render ordering, version labels, subtitle verification, and
   production configuration.
3. Run both targeted test files.

### Task 4: Verify the refactor

**Steps:**
1. Run `npm run typecheck`.
2. Run `npm test`.
3. Run `npm run build`.
4. Verify script and preroll stages on `http://localhost:3000`.

The current workspace is not a Git repository, so commit steps are omitted.
