# Haruna Android Bridge v0.3

`window.HarunaAndroid` is exposed only by the trusted local Android WebView.

Methods: `isAvailable`, `getStatus`, `loadModel`, `unloadModel`, `generate`, `stopGeneration`.

Generation events call `window.harunaAndroidOnEvent(JSON)`: `token`, `completed`, `error`, or `status`.

The JS side registers a pending generation before invoking native `generate`, preventing early streamed tokens from being lost.

Model selection is asynchronous: `loadModel` returns `status: loading` / `pendingSelection: true`; Android later emits a `status` event after copying and loading the selected GGUF.

No network API or fake LLM fallback is used. If the native model is unavailable, Haruna keeps its Basic rules/tools path.
