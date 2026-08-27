# Subtitle Style Across All Entry Points Design

## Decision

All user-facing subtitle burn actions use the same four MediaKit style fields:
font type, pixel size, RGBA color, and position preset. Production-plan values
remain workflow defaults; each burn surface exposes local controls so users can
review or override the style immediately before creating the subtitle video.

## Entry Points

- AI preroll post-production: initialize from the active production config and
  allow a per-render override.
- Standalone video post-production: initialize from shared defaults and persist
  the selected style with the local workspace state.
- Creative settings and production plan: continue defining defaults.

## Data Flow

A shared client-safe style model and control component produce the exact API
payload fields: `fontType`, `fontSize`, `fontColor`, and `position`.
Every `add_subtitles` request carries all four fields explicitly. The existing
server schema validates supported fonts, size range, RGBA format, and presets
before MediaKit submission.

## Verification

Component tests change all four controls and assert the submitted task snapshot.
Post-production tests also cover local workspace persistence. Existing provider,
visual subtitle verification, concat-source, and production-config tests remain
the regression boundary.
