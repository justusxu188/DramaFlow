# Remove Analysis Character Assets Implementation Plan

> **For Claude:** Implement this plan task-by-task in the current workspace.

**Goal:** Remove the duplicate character-asset workflow from the storyline analysis stage while retaining the asset library and AI preroll character-image selection.

**Architecture:** Remove the analysis-only UI and its save command, then stop deriving `CharacterBinding` candidates from analysis snapshots. Keep the stored `characters` fields and types readable for backward compatibility so existing pipeline JSON and runs remain valid.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, Vitest, Testing Library

---

### Task 1: Lock the UI behavior

**Files:**
- Modify: `src/components/interactions.test.tsx`

**Step 1:** Replace the character-workbench interaction test with an assertion that the analysis content remains visible while the character-asset card and controls are absent.

**Step 2:** Run:

```bash
npm test -- --run src/components/interactions.test.tsx
```

Expected: FAIL because the existing workbench is still rendered.

### Task 2: Remove the analysis-stage workbench

**Files:**
- Modify: `src/components/pipeline-analysis-stage.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Delete: `src/components/pipeline-character-workbench.tsx`

**Step 1:** Remove the optional `characterWorkbench` prop and render slot from `PipelineAnalysisStage`.

**Step 2:** Remove `PipelineCharacterWorkbench`, `saveCharacters`, and the analysis-stage prop wiring from `BatchPipelinePanel`.

**Step 3:** Delete the now-unreferenced component.

**Step 4:** Re-run the focused interaction test and expect PASS.

### Task 3: Remove the obsolete save action

**Files:**
- Modify: `src/app/api/projects/[projectId]/workflow/script-action-schemas.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/schema.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/simple-commands.ts`
- Delete: `src/app/api/projects/[projectId]/workflow/character-bindings-command.ts`

**Step 1:** Remove `save_character_bindings` from the discriminated union and simple-command routing.

**Step 2:** Delete its handler after verifying no references remain.

**Step 3:** Run the Workflow route tests and expect PASS.

### Task 4: Stop generating analysis character candidates

**Files:**
- Modify: `src/lib/pipeline-store.ts`
- Modify: `src/lib/pipeline-store.test.ts`

**Step 1:** Add store-level coverage showing analysis saves do not create character candidates.

**Step 2:** Remove candidate derivation from workspace reads, `saveAnalysis`, and `saveSharedStoryContext`.

**Step 3:** Preserve existing `CharacterBinding` fields and stored values without creating new ones.

**Step 4:** Run the pipeline-store tests and expect PASS.

### Task 5: Verify the complete change

**Step 1:** Confirm no references remain to the deleted component or action.

**Step 2:** Run:

```bash
npm run typecheck
npm test -- --run
npm run build
```

Expected: all checks pass.

No commit or push is included because the user did not request Git operations.
