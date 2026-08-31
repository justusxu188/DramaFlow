# Authentication, Project Isolation, and Arc Retry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add administrator-managed user login, strict project ownership isolation, role-based settings access, and a persistent retry action for failed story arc jobs.

**Architecture:** Store users in the existing local JSON persistence layer with scrypt password hashes. Use an HMAC-signed HttpOnly cookie for sessions, guard browser routes with Next.js proxy middleware, and enforce authorization again inside every server API. Add `ownerId` to local projects and assign all existing unowned projects to the first administrator during one-time setup.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Node.js crypto, local JSON persistence, Vitest, Testing Library.

---

### Task 1: Persist Users and Project Ownership

**Files:**
- Create: `src/lib/user-store.ts`
- Modify: `src/lib/project-store.ts`
- Test: `src/lib/user-store.test.ts`
- Test: `src/lib/project-store.test.ts`

**Steps:**
1. Add failing tests for first-admin creation, username uniqueness, password verification, disabled users, and project ownership.
2. Implement atomic `data/user-store.json` persistence with scrypt hashes and no plaintext passwords.
3. Add `ownerId` to local project records and project summaries.
4. Require an owner when creating a project.
5. Add an atomic migration that assigns unowned historical projects to the first administrator.
6. Run focused store tests and type checking.

### Task 2: Signed Sessions and Authentication APIs

**Files:**
- Create: `src/lib/auth-session.ts`
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/status/route.ts`
- Create: `src/app/api/auth/setup/route.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Test: `src/lib/auth-session.test.ts`
- Test: `src/app/api/auth/route.test.ts`

**Steps:**
1. Add tests for valid, expired, and tampered session cookies.
2. Implement seven-day HMAC-signed sessions using `FRAMEFLOW_AUTH_SECRET`.
3. Add one-time setup, login, logout, and current-session status endpoints.
4. Reject setup after the first administrator exists.
5. Reject disabled accounts on every session lookup.
6. Run focused authentication tests.

### Task 3: Login, Setup, and Application Shell

**Files:**
- Create: `src/components/auth-form.tsx`
- Create: `src/components/application-frame.tsx`
- Create: `src/app/login/page.tsx`
- Create: `src/app/setup/page.tsx`
- Create: `src/proxy.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/sidebar.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/auth-form.test.tsx`
- Test: `src/components/sidebar.test.tsx`

**Steps:**
1. Add tests for setup, login errors, logout, and role-sensitive navigation.
2. Build focused login and first-admin setup forms.
3. Protect application pages in `src/proxy.ts`, excluding auth, health, and internal worker routes.
4. Pass the authenticated user into the application shell.
5. Hide the system settings menu for ordinary users and expose logout for all users.
6. Run component and proxy tests.

### Task 4: Administrator User Management

**Files:**
- Create: `src/app/api/admin/users/route.ts`
- Create: `src/components/user-management.tsx`
- Modify: `src/app/settings/page.tsx`
- Test: `src/app/api/admin/users/route.test.ts`
- Test: `src/components/user-management.test.tsx`

**Steps:**
1. Add failing authorization and validation tests.
2. Implement list, create, role update, password reset, enable, and disable operations.
3. Prevent an administrator from disabling their own active account.
4. Render user management only on the administrator settings page.
5. Run focused API and component tests.

### Task 5: Enforce Project and Role Authorization

**Files:**
- Create: `src/lib/authorization.ts`
- Modify: `src/app/api/projects/route.ts`
- Modify: `src/app/api/projects/[projectId]/route.ts`
- Modify: `src/app/api/projects/[projectId]/assets/route.ts`
- Modify: `src/app/api/projects/[projectId]/assets/avatar/route.ts`
- Modify: `src/app/api/projects/[projectId]/assets/capture/route.ts`
- Modify: `src/app/api/projects/[projectId]/assets/generate-image/route.ts`
- Modify: `src/app/api/projects/[projectId]/pipeline/route.ts`
- Modify: `src/app/api/projects/[projectId]/post-production/route.ts`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts`
- Modify: `src/app/api/jobs/[jobId]/route.ts`
- Modify: `src/app/api/uploads/sign/route.ts`
- Modify: `src/app/api/settings/creative/route.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/library/page.tsx`
- Modify: `src/app/tasks/page.tsx`
- Modify: `src/app/production/page.tsx`
- Modify: `src/app/projects/[projectId]/page.tsx`
- Test: relevant route and page tests

**Steps:**
1. Add tests proving users cannot list, read, mutate, upload to, or run jobs for another user's projects.
2. Add reusable authenticated-user, administrator, and project-owner guards.
3. Filter project, library, task, and production queries by the authenticated user.
4. Allow administrators to access all projects.
5. Protect settings page and creative-settings API with administrator checks.
6. Protect upload signing and non-project APIs with authentication.
7. Run route and page tests.

### Task 6: Retry Every Failed Story Arc Job

**Files:**
- Modify: `src/components/pipeline-story-arc-stage.tsx`
- Modify: `src/components/batch-pipeline-panel.tsx`
- Modify: `src/components/pipeline-script-workspace.tsx`
- Test: `src/components/interactions.test.tsx`
- Test: `src/components/pipeline-script-workspace.test.tsx`

**Steps:**
1. Add a failing test for a persistent `重试失败任务（N）` action.
2. Derive the latest failed `mine_arcs` jobs for the current run.
3. Retry all failed story arc jobs while preserving completed arcs.
4. Keep the retry action visible even after dismissing the error callout.
5. Preserve the script-stage failure explanation and navigation back to story arcs.
6. Run focused interaction tests.

### Task 7: Regression and Deployment Checks

**Files:**
- Modify: `.env.example` or deployment documentation if present

**Steps:**
1. Document `FRAMEFLOW_AUTH_SECRET` as a required production secret.
2. Run all Vitest tests.
3. Run TypeScript type checking.
4. Run the production build.
5. Start the local app and Worker.
6. Verify setup, login, administrator menus, ordinary-user menus, project isolation, and story arc retry in the browser.
