# Video Finishing Tools Design

## Scope

The AI preroll stage gains three editing tools: precise subtitle removal, add subtitles, and quality enhancement. Subtitle recognition is no longer a separate command; opening Add Subtitles immediately runs ASR and then presents editable captions. The final-output stage gains basic image and text watermark operations. Composing a confirmed preroll with its bound highlight navigates directly to Final Output.

## Interaction

The preroll card keeps a compact single-row toolbar. Parameter-heavy actions open a modal so the existing three-column prompt workspace is not resized. Subtitle removal offers full video, selected ranges, or all except selected ranges. Add Subtitles defaults to the effective range from the latest subtitle-removal operation but lets the user switch to the full video. Quality enhancement exposes resolution and frame rate only.

The Add Subtitles modal has three states: recognizing, reviewing, and submitting. Recognized cues are intersected with the selected effective ranges; cues crossing a boundary are clipped to that boundary. This prevents new subtitles from covering portions where the original subtitles were retained.

## Data And Tasks

Each processed preroll stores the source URL, output URL, operation, completed time, and operation settings. Subtitle-removal settings persist on the render and become the default scope for Add Subtitles after refresh.

MediaKit remains responsible for subtitle removal, ASR, subtitle burn-in, enhancement, and concatenation. VOD watermarking is isolated behind a provider adapter. Image and text modes use configured workflow templates; missing credentials or template IDs produce an actionable configuration error rather than a fake success.

## Failure Handling

All operations are asynchronous and keep the current playable version until a new result succeeds. Version conflicts return HTTP 409. Subtitle burn-in still requires visual verification. Compose is blocked only while a processing action is active or when a subtitle result has failed verification.

## Validation

Unit tests cover range normalization and subtitle clipping. API tests cover precise erase parameters, enhancement, render metadata persistence, and watermark validation. Interaction tests cover merged ASR/add-subtitle behavior, modal controls, compose navigation, and final-output watermark controls.
