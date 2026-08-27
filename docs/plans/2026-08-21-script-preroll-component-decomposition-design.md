# Script And Preroll Component Decomposition Design

## Scope

`BatchPipelinePanel` still contains the complete AI preroll script workspace,
script editor modal, and generated-preroll review stage. These areas account
for most of the remaining rendering code and combine dense interaction logic
with the workflow orchestration container.

The API request handlers, polling, active Run resolution, and workspace-scoped
job filtering remain in the parent. This preserves one source of truth for
project, workflow, Run, stage, and artifact context.

## Component Boundaries

`PipelineScriptWorkspace` owns script-stage presentation and local UI state:

- Highlight navigation and script cards.
- Expanded script details.
- Prompt compilation and video-generation status.
- Per-character image selection controls.
- Bulk selection and deletion commands.
- Opening and closing the script editor.

It receives current-Run pipeline data, already-scoped jobs, controlled
selection values, request status, and command callbacks. It does not fetch or
persist directly.

`PipelineScriptEditorModal` owns the editable script draft and timeline editing
helpers. Saving returns the complete edited script to the parent command
handler. Closing discards the local draft.

`PipelinePrerollStage` owns generated-preroll versions, running status,
post-production controls, curation state, and empty state. It receives the
current pipeline snapshot and callbacks for refresh and curation.

## Alternatives

1. Move only JSX fragments. This leaves derived view logic and local state in
   the parent and provides little ownership improvement.
2. Move API requests into each child. This creates multiple workflow clients
   and risks Run or stage context drift.
3. Move complete UI domains while retaining requests in the parent. This gives
   clear boundaries without changing persistence semantics and is selected.

## Verification

Existing `BatchPipelinePanel` interaction tests remain the public behavior
contract. They cover highlight switching, script generation, prompt
compilation, editing, deletion, character references, video generation,
preroll status, curation, and post-production controls. The refactor must also
pass TypeScript, the full test suite, production build, and a real-page check.
