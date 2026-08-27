# Artifact History Folding Design

## Goal

Reduce vertical page length while preserving artifact ownership, current work,
failures, and recovery paths.

## Domain Rules

Highlights are parallel current outputs, not versions of one artifact. Show the
first three by default and place remaining highlights behind one "show more"
control.

Preroll renders are versions owned by a script. Group renders by `scriptId`,
sort each group newest first, and show the newest render for every script.
Historical renders expand independently inside their script group.

Final compositions are one global chronological history. Show the newest
composition and place older compositions behind one history control.

## Visibility Exceptions

Collapsing must never hide an item that needs attention:

- running or failed highlights remain visible;
- an artifact already known as `expired` or `missing` remains visible;
- running preroll jobs remain in their existing status section;
- the newest preroll render for every script remains visible.

Unknown folded artifacts remain `checking`. Folding does not classify an
artifact as unavailable and does not change pipeline data.

## Interaction

Controls use explicit counts:

- `展开更多高光（N）`
- `展开历史版本（N）`
- `查看历史成片（N）`

Expanded controls change to a collapse action. Expansion is local UI state and
is reset when the stage unmounts. No persistence or API changes are required.

## Loading

The existing viewport lazy mounting remains active. Expanding history creates
artifact cards, but only videos near the viewport mount. The first current
artifact in each stage stays eager.

## Verification

Component tests verify default visibility, expansion and collapse, per-script
preroll grouping, and attention-item visibility. Full tests and browser checks
verify stable counts, no hidden failures, reduced page height, and no horizontal
overflow.
