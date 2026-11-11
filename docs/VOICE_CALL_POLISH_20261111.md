# Voice call visual polish — 2026-11-11

Base: d8ab058c806c8e2ca01a57f396c94896c0f8e778. Checkpoint: checkpoint/before-voice-call-polish-20261111. Source changes limited to voice/call-reference.css; original rules retained, scoped call/miniplayer rules appended. No voice JS, native STT/TTS, chat state, model loading or data changes.

Adds volumetric purple orb shading, soft highlights/rim and state halos, quieter typography and state badge, theme-aware call colors, readable header controls, compact landscape layout and matching miniature orb. Existing --voice-scale audio-level transform retained. Motion limited to transform/opacity; no canvas, WebGL or new dependencies. Rim rotation runs only while thinking; halo breath only while speaking. Reduced-motion and background modes stop these animations.

Chromium tests with real CallView and actual app assets, simulated native bridges: 360x800, 800x1280, 1280x800 and 800x360, both themes. Ten phases checked for dialog bounds, circular orb and absence of horizontal overflow. Verified callback wiring for settings/resume/pause/skip/stop speech/finish/end, minimize/reopen, audio-level scale, reduced motion, background pause and miniplayer/wave cleanup. Final header contrast checked in light mode on phone and landscape tablet. No physical Android/audio inference or performance measurement. No remote build run; APK not regenerated.
