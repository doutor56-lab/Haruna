"""Compile/run only the pure voice queue and Whisper format checks using Kotlin jars already fetched by the Android build."""
from pathlib import Path
import re
import subprocess
import tempfile

cache = Path.home() / '.gradle/caches/modules-2/files-2.1'


def version(path):
    return tuple(int(n) for n in re.findall(r'\d+', path.parents[1].name))


def jar(group, artifact, preferred=None):
    found = list((cache / group / artifact).glob('*/*/*.jar'))
    matched = [p for p in found if p.parents[1].name == preferred]
    options = matched or found
    if not options:
        return None
    return max(options, key=version)


compiler = jar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable')
if compiler is None:
    raise SystemExit('Run the Android build first: its existing Kotlin compiler cache is required.')
kotlin_version = compiler.parents[1].name
stdlib = jar('org.jetbrains.kotlin', 'kotlin-stdlib', kotlin_version)
annotations = jar('org.jetbrains', 'annotations')
if stdlib is None or annotations is None:
    raise SystemExit('Missing existing Kotlin build dependencies.')
dependencies = [compiler, stdlib, annotations]
for group, name in [
    ('org.jetbrains.kotlin', 'kotlin-script-runtime'),
    ('org.jetbrains.kotlin', 'kotlin-reflect'),
    ('org.jetbrains.kotlin', 'kotlin-daemon-embeddable'),
    ('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm'),
    ('org.jetbrains.intellij.deps', 'trove4j'),
]:
    value = jar(group, name, kotlin_version)
    if value:
        dependencies.append(value)
with tempfile.TemporaryDirectory(prefix='haruna-voice-check-') as target:
    subprocess.run([
        'java', '-cp', ':'.join(map(str, dependencies)), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
        '-no-stdlib', '-no-reflect', '-jvm-target', '17',
        '-classpath', f'{stdlib}:{annotations}', '-d', target,
        'app/src/main/java/com/proxyslabs/haruna/diagnostics/LabSystemPrompt.kt',
        'scripts/check_system_prompt.kt',
    ], check=True)
    subprocess.run(['java', '-ea', '-cp', f'{target}:{stdlib}',
                    'com.proxyslabs.haruna.diagnostics.SystemPromptCheck'], check=True)

