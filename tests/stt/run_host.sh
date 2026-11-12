#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
# Test substitutes are confined to tests/stt/stubs and tests/stt/native.
check_dir="${HARUNA_STT_TEST_DIR:-/tmp/haruna-stt-tests}"
mkdir -p "$check_dir"
: "${JSON_JAR:?Set JSON_JAR to the org.json jar used by the app unit tests}"
compiler="${KOTLINC:-$(command -v kotlinc)}"
java_dir="${JAVA_HOME:-$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")}"
bash "$compiler" tests/stt/stubs/*.kt tests/stt/SessionCheck.kt app/src/main/java/com/proxyslabs/haruna/speech/{SttManager,WhisperModels,WhisperSttEngine,WhisperCppEngine,SttDiagnostics,SttResultPolicy,SttErrors,TtsTextNormalizer,TtsManager,SpeechTextQueue,IdleSpeechSessions}.kt app/src/main/java/com/proxyslabs/haruna/image/ImageLease.kt -cp "$JSON_JAR" -include-runtime -d "$check_dir/session.jar"
java -cp "$check_dir/session.jar:$JSON_JAR" com.proxyslabs.haruna.speech.SessionCheckKt
"${CXX:-g++}" -std=c++17 -pthread -Itests/stt/native -I"$java_dir/include" -I"$java_dir/include/linux" tests/stt/native/check_whisper_session.cpp -o "$check_dir/native"
"$check_dir/native"
node scripts/check_voice.mjs
