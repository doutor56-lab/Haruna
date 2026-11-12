#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${INSTALLER_CLASSPATH:?Provide the existing org.json, commons-compress and its dependency jars}"
: "${WHISPER_TINY_ARCHIVE:?Provide the official Tiny tar.bz2; this test downloads no model}"
compiler="${KOTLINC:-$(command -v kotlinc)}"
check_dir="${HARUNA_INSTALLER_TEST_DIR:-/tmp/haruna-installer-tests}"
mkdir -p "$check_dir"
bash "$compiler" tests/stt/install-stubs/*.kt tests/stt/InstallerCheck.kt app/src/main/java/com/proxyslabs/haruna/speech/{SttModelManager,WhisperModels,WhisperFileHeader,SttDownload}.kt -cp "$INSTALLER_CLASSPATH" -include-runtime -d "$check_dir/installer.jar"
java -Xmx512m -cp "$check_dir/installer.jar:$INSTALLER_CLASSPATH" com.proxyslabs.haruna.speech.InstallerCheckKt "$WHISPER_TINY_ARCHIVE"
