# Light Theme Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the application shell and working surfaces to a white light theme while preserving readable controls, labels, status states, and media previews.

**Architecture:** Replace the global semantic color tokens with a neutral light palette, then migrate hard-coded dark application surfaces to those tokens. Keep black backgrounds and white overlay text only where they belong to video, image, subtitle, and timeline preview surfaces.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS

---

### Task 1: Global Semantic Palette

**Files:**
- Modify: `src/app/globals.css:1-34`

**Steps:**
1. Change the document color scheme to light.
2. Replace background, panel, border, text, muted, and status tokens with accessible light-theme values.
3. Keep the existing coral accent identity, but darken semantic colors where needed for text contrast.

### Task 2: Application Surfaces

**Files:**
- Modify: `src/app/globals.css`

**Steps:**
1. Replace hard-coded dark sidebar, cards, menus, dialogs, inputs, toolbars, and workspace surfaces with semantic tokens.
2. Update selected buttons and labels so their text color contrasts with their background.
3. Preserve black media canvases and white text overlays used on video or image content.
4. Reduce dark-theme shadows to light neutral shadows.

### Task 3: Regression Verification

**Files:**
- Test: existing component and interaction tests

**Steps:**
1. Run `npm run typecheck`.
2. Run `npm test`.
3. Run `npm run build`.
4. Inspect the project center, production workspace, dialogs, buttons, labels, video players, and mobile layout through the running local preview.
