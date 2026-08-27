# AI Preroll Handoff Refinement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the transition from confirmed preroll scripts to prompt review and video generation explicit, compact, and snapshot-safe.

**Architecture:** Keep prompt compilation as an explicit action after asset and parameter selection. Resolve every selected image through one project-scoped helper: active ingested avatar assets use `asset://`, while ordinary project images use their TOS URL. Persist the resolved bindings and per-script generation settings in the confirmed prompt plan, which remains the source of truth for video submission.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library.

---

### Task 1: Unify reference resolution

**Files:**
- Modify: `src/lib/project-store.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/compile-prompts-command.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/update-video-prompt-command.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/preroll-command.ts`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`

1. Add a shared resolver that returns `asset://{avatarAssetId}` only for active ingested avatar assets.
2. Return `sourceUrl` for ordinary project image assets.
3. Replace duplicated inline resolution in compile, save, and generation commands.
4. Test both branches and reject cross-project asset IDs.

### Task 2: Preserve explicit script-to-video context

**Files:**
- Modify: `src/components/pipeline-script-workspace.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/components/pipeline-preroll-stage.tsx`
- Modify: `src/components/preroll-prompt-editor.tsx`
- Test: `src/components/interactions.test.tsx`

1. Pass the originating confirmed script ID when opening the video stage.
2. Scroll and focus that script's prompt studio.
3. Do not compile automatically before asset and parameter review.
4. Restore only saved manual bindings; leave new bindings at “不关联图片”.

### Task 3: Simplify prompt actions and enforce snapshot priority

**Files:**
- Modify: `src/components/preroll-prompt-editor.tsx`
- Modify: `src/app/api/projects/[projectId]/workflow/preroll-preflight.ts`
- Test: `src/components/interactions.test.tsx`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`

1. Replace three persistent footer buttons with one state-driven primary action.
2. Use “生成/更新提示词”, “保存并确认提示词”, or “生成 AI 前贴视频” according to current state.
3. Keep manual regeneration as a compact prompt-header action.
4. Ensure workbench model, duration, resolution, ratio, subtitle, and asset bindings are persisted in the prompt snapshot and override production defaults.
5. Reject video submission if current UI inputs differ from the confirmed prompt snapshot.

### Task 4: Align the studio and video history

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/preroll-prompt-editor.tsx`
- Modify: `src/components/pipeline-preroll-stage.tsx`
- Test: `src/components/interactions.test.tsx`
- Test: `src/components/pipeline-artifact-folding.test.tsx`

1. Give the asset, prompt, and preview panes one shared desktop height.
2. Make each pane scroll internally without changing the outer grid height.
3. Keep the parameter controls and retained actions on one desktop row with stable widths.
4. Replace “最新版本” with the render creation time.
5. Sort prompt previews and historical render versions by `createdAt` descending.

### Task 5: Verify

1. Run focused component and route tests.
2. Run `npm run typecheck`.
3. Run `npm test`.
4. Run `npm run build`.
5. Verify the desktop and narrow layouts in the existing local development server without submitting paid generation jobs.
