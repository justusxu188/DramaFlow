# Running Workflow Polling Design

## Goal

Eliminate idle workflow requests while preserving prompt updates for active
jobs and explicit synchronization points.

## Polling Rules

The workspace loads once when the project or production entry changes.

After the initial load:

- poll every five seconds only while the current workspace has a latest job in
  `queued` or `running`;
- do not poll when the current workspace has no active job;
- do not poll while the document is hidden;
- refresh immediately when the document becomes visible;
- refresh immediately when the window regains focus;
- keep existing refreshes after writes and retries;
- keep the manual refresh command.

## Scope

The active-job signal uses jobs already scoped by `WorkspaceContext` and reduced
through `latestPipelineJobs`. Historical jobs and jobs from other runs,
projects, workflow entries, or stages must not keep polling alive.

## Request Coordination

Polling uses one in-flight guard. If a timer, focus event, or visibility event
fires while the previous polling refresh is unresolved, the new polling refresh
is skipped. Existing explicit write-follow-up refreshes continue to call the
workspace refresh function directly because they are transaction completion
boundaries.

## Component Boundary

A small `useWorkspacePolling` hook owns visibility, focus, timer, and in-flight
behavior. `BatchPipelinePanel` remains responsible for fetching and applying
workspace data. This keeps timing behavior independently testable and avoids
adding more orchestration logic to the large panel.

## Verification

Fake-timer tests cover initial load, idle silence, running polling, hidden-page
pause, visible/focus refresh, and overlapping-request suppression. Existing
interaction tests verify that stage status and explicit write refreshes remain
unchanged.
