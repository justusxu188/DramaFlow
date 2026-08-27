# Shared Artifact Run Isolation Design

## Problem

The uploaded-highlight workflow may reuse storyline analysis and story arcs from
an existing full-drama run. When no uploaded-highlight run exists, the workspace
snapshot currently also copies the source run ID into `currentRunId`.

The client then treats legacy jobs from that source run as current workflow
jobs. This can mark scripts, prerolls, or final outputs complete even though the
uploaded-highlight workflow has no selected highlight and has never started.
The workspace context also labels the source run as the current batch.

## Decision

Shared artifacts and run identity are separate concepts.

When a run exists for the requested production entry:

- expose that run ID as `currentRunId`;
- expose that run's entry-owned artifacts and jobs;
- fall back to compatible shared analysis and arcs only when they are absent.

When no run exists for the requested production entry:

- leave `currentRunId` undefined;
- expose compatible shared analysis, characters, and arcs;
- expose no highlights, scripts, renders, or compositions;
- let the UI display the batch as pending creation;
- exclude source-run jobs through the existing `WorkspaceContext` filters.

The read path must not create a placeholder run. The first production command
remains responsible for creating the entry-specific run.

## Scope

The change belongs in pipeline workspace snapshot assembly. Persistence, source
run contents, shared artifact selection, and write activation behavior remain
unchanged.

## Verification

A pure resolver test covers a project with a completed full-drama run and no
uploaded-highlight run. It must preserve analysis and arcs while returning no
current run ID or entry-owned output artifacts. Existing tests cover activation
when an entry-specific run does exist.

Browser validation confirms that the uploaded-highlight page shows a pending
batch, completed shared analysis/arcs, waiting scripts/prerolls/outputs, and no
foreign errors or running tasks.
