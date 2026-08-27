# Background Preroll Post-production Design

## Goal

Move preroll subtitle recognition, subtitle removal, subtitle burn-in, and enhancement from dialog-owned polling to persistent Pipeline Jobs.

## Interaction

- Clicking Add Subtitles starts ASR without opening the editor.
- The current video remains playable while ASR runs.
- The toolbar shows persisted task state and progress.
- If ASR completes while the same video remains mounted, the subtitle editor opens automatically.
- If the user navigates away, the toolbar shows Subtitle Review Pending; clicking it opens the saved ASR result.
- Confirming subtitles closes the dialog and starts background subtitle burn-in.
- Subtitle removal and enhancement close their configuration dialogs immediately after submission and continue in the background.
- The current video changes only after the worker has obtained, stored, and validated the processed output.

## Data Integrity

Each job stores `renderId`, `scriptId`, `sourceVideoUrl`, operation settings, and workflow context. The worker checks the current Render URL before submitting and again before applying a result. One active post-production job is allowed per Render.

## Task Center

All operations use the `post_production` job kind. Task Center derives the visible name from `input.operation`, including Subtitle Recognition, Subtitle Removal, Add Subtitles, and Quality Enhancement.

## Existing Subtitle Result

The existing subtitle-burn result completed successfully and was stored, but it belongs to the older 2026-08-21 Render. The current preview is the newer 2026-08-23 Render, which was subsequently enhanced. The UI therefore correctly plays a different file, but previously did not explain the version mismatch.
