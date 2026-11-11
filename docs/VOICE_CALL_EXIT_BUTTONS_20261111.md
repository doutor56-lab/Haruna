# Call exit buttons

Base: 01bc20831bfbfed66a3d7d839bfa142a0df26b85. Checkpoint: checkpoint/before-call-exit-buttons-20261111.

Clarifies existing actions, without changing endVoice/STT/TTS/LLM/native behavior: visible red Encerrar button with hangup icon in call header, matching red end action in the listening controls and miniplayer. End actions have explicit labels/titles, contrasted white icons and >=44px hit area. Back button is labeled Voltar ao chat sem encerrar a chamada and keeps its minimization callback. No broken callback was reproduced; the existing end routine remains in place. Orb renderer, audio capture and generation engines unchanged.

`node tests/voice_call_exit_ui_check.cjs` requires development Playwright/Chromium (no app dependency added). Real application and call-controller test with simulated native bridges passed 320x700 and 800x360, dark/light: header end at ready, listening footer end, minimize preserves capture, miniplayer end, speaking end requests STT/TTS/service stop and generation cancellation, late reply cannot reopen call, Escape/miniplayer reopen, repeated opening and cleanup. Checked header fit, visible caption, contrasting icon and minimum tap area. No real Android/audio/inference test and no new APK/remote build.
