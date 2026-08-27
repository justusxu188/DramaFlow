# Batch Pipeline Remaining UI Decomposition Design

## Goal

Continue reducing `BatchPipelinePanel` without moving Run resolution, polling,
or workflow command semantics into presentation components.

## Boundaries

`PipelineCharacterWorkbench` owns the editable character draft, selected
characters, broken appearance IDs, merge/split operations, and reference-image
selection. The parent provides current-Run characters and source-video
metadata. Saving calls a parent callback and receives the persisted characters
back, so the child can reset its dirty state without maintaining a second
server snapshot.

`PipelineFinalOutputsStage` owns final-video ordering, version labels, subtitle
source labels, media previews, empty state, and curation controls.

`PipelineNewBatchConfirmationModal` and
`PipelineScriptDeleteConfirmationModal` own confirmation presentation only.
The parent retains the pending intent and executes the commands.

## API Boundary

After these UI domains are removed, reassess the parent. Repeated HTTP
serialization may move into a pure `pipeline-workflow-client` module, but
state transitions and current-Run checks must remain in the orchestrator.
Avoid replacing the component with one equally large controller hook.

## Verification

Use the existing interaction suite for character reference images, script
deletion, batch confirmation, final outputs, and curation. Complete with
TypeScript, all tests, production build, and a real-page check.
