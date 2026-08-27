# Artifact Availability Design

## Goal

Represent whether a generated video is currently playable and provide a clear
recovery path when historical URLs expire.

## Status Model

Every mounted media artifact has one transient status:

- `checking`: URL exists and the browser is loading metadata.
- `available`: metadata loaded successfully.
- `expired`: the browser rejected or failed to load the resource.
- `missing`: the artifact has no URL.

The status is runtime evidence, separate from persisted job completion. A
failed URL does not delete the historical artifact or change its Run lineage.

## UI

Create a shared `ArtifactVideo` component. It renders the video while checking
or available, and a structured fallback when expired or missing. The fallback
shows the artifact context, explains that the historical record is retained,
and offers:

- Retry loading the same URL.
- Regenerate the preroll when a script ID is available.
- Return to production planning for expired highlights.
- Return to preroll processing for expired final compositions.

Highlight, preroll, and final-output stages report status changes to the
workspace. Stage headers display available, checking, and expired counts.

## Counting

Persisted completion remains unchanged. Once runtime evidence marks a URL
expired, that artifact is excluded from the stage's usable count and the stage
navigation changes to an attention state. Unknown, unmounted artifacts are not
declared expired.

## Verification

Unit-test status transitions and retry behavior. Interaction tests must verify
that an expired artifact shows recovery UI and no longer appears as usable.
Run the full suite, typecheck, production build, and browser validation.
