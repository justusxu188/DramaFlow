# Persistent Pipeline Worker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure normal development and Node production startup always run the Pipeline Worker beside the Next.js server.

**Architecture:** Add one Node process supervisor that starts Next.js and the existing worker as sibling child processes. It derives the worker base URL from the configured Next.js port, forwards shutdown signals, and fails the whole process if either child exits unexpectedly so queue processing cannot silently stop.

**Tech Stack:** Node.js child processes, Next.js 16, existing `scripts/pipeline-worker.mjs`

---

### Task 1: Add the process supervisor

**Files:**
- Create: `scripts/run-with-worker.mjs`

1. Resolve the local Next.js CLI and existing worker script.
2. Forward command-line arguments to `next dev` or `next start`.
3. Derive `APP_BASE_URL` from `PORT`, `--port`, or `-p`.
4. Start both child processes with inherited output.
5. Forward `SIGINT` and `SIGTERM` and stop the sibling when either process exits.

### Task 2: Make standard startup persistent

**Files:**
- Modify: `package.json`
- Modify: `README.md`

1. Route `npm run dev` and `npm start` through the supervisor.
2. Keep direct Web-only commands available as `dev:web` and `start:web`.
3. Keep `npm run worker` for independent deployment and diagnostics.
4. Document the combined and split-process startup modes.

### Task 3: Verify

1. Run the supervisor in dry-run mode and verify its commands and base URL.
2. Start it on an unused port and verify `/api/health`.
3. Confirm the Worker emits its connected message and ticks successfully.
4. Run TypeScript checks, the full test suite, and the production build.
