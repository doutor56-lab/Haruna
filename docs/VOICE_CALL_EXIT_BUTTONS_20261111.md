# Circular call exit buttons

Base: cd374163872cef951fe7f722459fd58cc9ea0a45. Checkpoint: checkpoint/before-circular-call-exits-20261111.

User requested simpler round buttons rather than elongated controls. Source changes limited to call CSS: header back/end buttons have equal 44x44px border-box dimensions, explicit 44px minimum height and 50% radius. This overrides the generic dialog 48px minimum height that otherwise creates an oval. End button caption is visually hidden, retaining the existing aria-label/title and hangup icon. Miniplayer end button is explicitly 44x44px/circular. No JS behavior, engine, orb or other screen changes.

Updated `tests/voice_call_exit_ui_check.cjs`: checks both header buttons are square with >=44px hit areas and circular end radius, accessible hidden label, plus round miniplayer end. Chromium real app/call-controller checks passed 320x700 and 800x360 in dark/light. Existing end/minimize cases passed with native doubles: STT/TTS/service stop calls, generation cancellation invocation, late reply ignored, minimize preserves capture, Escape/reopen and UI cleanup. Requires development Playwright/Chromium; no app dependency added. No physical Android/audio test or remote build/APK.
