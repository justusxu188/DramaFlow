# Artifact Video Lazy Mount Design

## Goal

Reduce concurrent media requests without hiding artifact metadata, controls, or
recovery actions.

## Loading Model

The first video in each active stage mounts immediately. Remaining videos keep
their normal card layout but do not create a `<video>` element until their
container enters a preload boundary 300 pixels outside the viewport.

Once mounted, a video remains mounted until the stage unmounts. Scrolling away
must not abort and restart a media request.

## Availability

Deferred artifacts remain `checking` until their video mounts and reports
`loadedmetadata` or `error`. They are never marked missing or expired merely
because they are outside the viewport.

The existing availability summary therefore remains compatible:

- first item can become `available` immediately;
- deferred items remain `checking`;
- viewed items transition to `available` or `expired`.

## Component Boundary

`ArtifactVideo` owns the `IntersectionObserver` because it is the common media
boundary for highlights, prerolls, and final compositions. A `deferred` prop
selects viewport-driven mounting. `PipelineHighlightStage`,
`PipelinePrerollStage`, and `PipelineFinalOutputsStage` mark only their first
rendered video as eager.

Preroll post-production controls stay mounted. Only their internal video player
is deferred, so subtitle and composition state remains visible and stable.

## Fallback

If `IntersectionObserver` is unavailable, deferred media mounts immediately.
This preserves compatibility in older browsers, tests, and non-visual
environments.

## Verification

Tests cover eager mounting, deferred placeholders, intersection-triggered
mounting, observer cleanup, and the no-observer fallback. Browser verification
confirms that each stage initially mounts one video, additional videos mount
when scrolled near the viewport, and no horizontal overflow or runtime error is
introduced.
