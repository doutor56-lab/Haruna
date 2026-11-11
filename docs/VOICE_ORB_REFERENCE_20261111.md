# User-supplied Voice Orb integration

Base: cb960dcc19b71b327b03f5c211c6189ba4b95e86. Checkpoint: checkpoint/before-user-orb-integration-20261111.

Adapted the user-provided Haruna Voice Orb HTML as a reusable call-only 2D renderer. Removed demo labels/buttons, standalone microphone/AudioContext, synthetic voice amplitude/frequency bands, dust, floor reflection, global setState/setLevel hooks and click-generated pulses. Call presentation paragraphs/dots are hidden; real status, control labels and recognized transcript remain available. Existing voice and native pipelines are unchanged.

Canvas is bounded to 320x320 with capped pixel ratio; four fluid layers and 72 contour points. Active voice animation is limited by a 50 ms timer plus RAF; thinking uses 80 ms. Idle is static. No new dependencies, networking, analytics or audio access. Existing call state and supplied audio levels drive rendering; missing level remains zero, decorative flow is not an audio measurement. Canvas pauses when minimized/hidden or reduced-motion is active, and frees frame/timer/listener/canvas resources on close. Previous CSS orb is the fallback when canvas is unavailable or drawing fails. Miniplayer remains CSS for low overhead.

Tests: `node tests/voice_orb_check.cjs` (actual renderer, DOM/canvas/scheduler doubles) passed bounded cadence/buffer, clamping, no synthetic amplitude, idle/mini/background/reduced-motion pause, cleanup and fallback. Chromium real canvas tests passed drawn-pixel checks, minimized/background/reduced-motion pause, close, transcript and fallback in 360x800 and 800x360, both themes. Existing CallView ten-phase/callback/miniplayer/cleanup checks passed 360x800, 800x1280, 1280x800 and 800x360, both themes. Provided reference rendered locally for comparison without enabling its microphone.

No physical Android/audio test or on-device performance claim. No APK/remote build generated. Original data, chat, image generation, models and STT/TTS engines preserved.
