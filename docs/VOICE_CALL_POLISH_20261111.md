# Voice call visual polish — 2026-11-11

Base: d8ab058c806c8e2ca01a57f396c94896c0f8e778. Checkpoint: checkpoint/before-voice-call-polish-20261111. Source changes limited to voice/call-reference.css; original rules retained, scoped call/miniplayer rules appended. No voice JS, native STT/TTS, chat state, model loading or data changes.

Adds volumetric purple orb shading, soft highlights/rim and state halos, quieter typography and state badge, theme-aware call colors, readable header controls, compact landscape layout and matching miniature orb. Existing --voice-scale audio-level transform retained. Motion limited to transform/opacity; no canvas, WebGL or new dependencies. Rim rotation runs only while thinking; halo breath only while speaking. Reduced-motion and background modes stop these animations.

Chromium tests with real CallView and actual app assets, simulated native bridges: 360x800, 800x1280, 1280x800 and 800x360, both themes. Ten phases checked for dialog bounds, circular orb and absence of horizontal overflow. Verified callback wiring for settings/resume/pause/skip/stop speech/finish/end, minimize/reopen, audio-level scale, reduced motion, background pause and miniplayer/wave cleanup. Final header contrast checked in light mode on phone and landscape tablet. No physical Android/audio inference or performance measurement. No remote build run; APK not regenerated.

## Further layout refinement

Base 619ddb3, checkpoint checkpoint/before-call-layout-refinement-20261111. User will supply an orb reference separately: all orb artwork, level transforms and animations retained byte-for-byte. Only call header/text hierarchy, grouped control background, secondary control theme colors, focus/hover hierarchy and spacing refined. Empty control groups have transparent decoration while waiting. No JS or engine changes. Eight theme/viewport configurations passed ten-phase checks, including 800x360; callback/miniplayer/cleanup and reduced-motion/background behavior preserved. Empty waiting decoration checked separately in both themes. Native Android/audio remains untested; no new APK or remote build generated.

## Compact call frame

Base 230152a; checkpoint checkpoint/before-compact-call-20261111. CSS-only source change: portrait call frame capped at 420px wide / 560px high (also bounded by viewport), landscape 640px / 400px, tighter margins/padding and proportional orb size. Existing renderer/artwork, circular 44px exit targets and separate lower controls retained. Transcript stays available in a 72px scrollable area; no text/history removed. No native or application JS changed.

Ten-phase visual/callback checks passed 320x700, 360x800, 800x1280, 1280x800 and 800x360 in both themes. Real call-controller/native-double exit checks additionally passed four phone/landscape/theme cases, compact-frame bounds, long transcript scrolling and no footer card. No physical Android test, new APK or remote build.
