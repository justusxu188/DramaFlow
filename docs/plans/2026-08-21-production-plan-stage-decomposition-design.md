# Production Plan Stage Decomposition Design

## Context

`BatchPipelinePanel` still owns 4260 lines of orchestration and rendering. The
Workflow API has already reached a practical boundary: its route is thin and
the largest implementation module is 157 lines with one focused
responsibility. Further API splitting would add navigation cost without
reducing meaningful coupling.

The highest-value next step is to move the complete production-plan stage out
of `BatchPipelinePanel`. This stage contains source/highlight selection
summaries, all production configuration controls, validation guidance, and the
save-state footer.

## Chosen Boundary

Create a presentational `PipelineProductionPlanStage` component. It receives:

- The normalized `ProductionConfig`.
- Workflow mode flags and source/highlight summaries.
- Already-derived duration limits and recommendations.
- Save and configuration-change callbacks.
- Current dirty, saving, and persisted-plan states.

The parent remains the source of truth for configuration, target-duration text
inputs, network requests, polling, workflow context, and API errors. The child
must not fetch data or infer the active Run.

This boundary keeps data flow one-way and prevents a second production-plan
store. It also preserves the existing rule that project, workflow, Run, stage,
and artifact context are resolved by the orchestration container.

## Alternatives

1. Extract only field groups. This reduces JSX size but leaves plan selection,
   dirty-state messaging, and validation guidance scattered in the parent.
2. Extract a production-plan hook first. This moves state mechanics but keeps
   the largest rendering block in place and creates a less visible ownership
   boundary.
3. Extract the complete stage. This provides the clearest ownership boundary
   while preserving current state and request semantics. This is the selected
   approach.

## Error Handling And Testing

API errors continue to render through the parent-level stage feedback. The
child only renders deterministic validation and save-state messages.

Existing `BatchPipelinePanel` interaction tests remain the behavioral contract:
source validation, uploaded-highlight selection, duration/count editing,
subtitle settings, ratio/model persistence, and save/start payloads must remain
unchanged. A focused component test is unnecessary while all behavior is still
exercised through the public panel boundary.
