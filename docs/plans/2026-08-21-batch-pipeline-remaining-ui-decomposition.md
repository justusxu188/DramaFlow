# Batch Pipeline Remaining UI Decomposition Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract the remaining independent UI domains from `BatchPipelinePanel`.

**Architecture:** Keep workflow context, polling, command execution, and persisted snapshots in the parent. Move character draft interaction, output rendering, and confirmation presentation into controlled components.

**Tech Stack:** Next.js 16, React 19, TypeScript, Testing Library, Vitest

---

### Task 1: Extract character workbench

**Files:**
- Create: `src/components/pipeline-character-workbench.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Test: `src/components/interactions.test.tsx`

Move character draft state, merge/split behavior, image failure state, and all
workbench JSX. Keep persistence in the parent through an async callback.

### Task 2: Extract final outputs

**Files:**
- Create: `src/components/pipeline-final-outputs-stage.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`

Move output ordering, labels, preview, curation, and empty state.

### Task 3: Extract confirmation modals

**Files:**
- Create: `src/components/pipeline-confirmation-modals.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`

Move new-batch and script-deletion confirmation presentation. Preserve pending
intent and command execution in the parent.

### Task 4: Reassess API extraction

Count remaining parent lines, states, and request handlers. Extract only
stateless HTTP serialization if it materially simplifies the parent.

### Task 5: Verify

Run:

```bash
export PATH="/opt/homebrew/bin:$PATH"
npm run typecheck
npm test
npm run build
```

Verify the analysis character workbench and final-output stage on
`http://localhost:3000`.
