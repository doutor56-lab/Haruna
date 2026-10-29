"""Focused isolation/gate tests; no inference outputs are simulated or published."""
from argparse import Namespace
from pathlib import Path
import tempfile
import subprocess
import json
import shutil
import os
from diagnostic46_profiles import BASE,CHANGES,expected
from diagnostic46_run import expected_identity

for mode in ('C_NO_KLEIDIAI','D_NO_REPACK','E_NO_ALL_VARIANTS','F_ARMV8A_ONLY'):
    actual=expected(mode)
    assert len([key for key in BASE if BASE[key]!=actual[key]])==1
assert expected('E_NO_ALL_VARIANTS')['GGML_CPU_ARM_ARCH']==''
assert expected('F_ARMV8A_ONLY')['GGML_CPU_ALL_VARIANTS']=='ON'
for digest,size in [(None,None),('0'*64,16),('wrong',1536000)]:
    try:expected_identity(Namespace(reference45=None,expected_sha256=digest,expected_bytes=size))
    except ValueError:pass
    else:raise AssertionError('Unsafe model identity accepted')
assert expected_identity(Namespace(reference45=None,expected_sha256='a'*64,expected_bytes=1536000))==('a'*64,1536000)
runner=Path('app/src/androidTest/java/com/proxyslabs/haruna/diagnostic45/CanonicalRunner.kt').read_text()
assert runner.index('require(model.length() == expectedBytes)')<runner.index('AiChat.getInferenceEngine')
assert runner.index('require(observedSha == expectedSha)')<runner.index('AiChat.getInferenceEngine')
assert 'deleteRecursively' not in runner and 'diagnostic46/$runId' in runner and 'outputOwned &&' in runner
cmake=Path('patches/diagnostic46/matrix.cmake').read_text()
assert 'set(GGML_CPU_ARM_ARCH "armv8-a"' not in cmake.split('E_NO_ALL_VARIANTS')[1].split('elseif')[0]
with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp)
    fixture=root/'metadata-check.cmake'
    fixture.write_text('''set(HARUNA45_VALUE 1)
set(HARUNA46_SOURCE_COMMIT aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)
set(HARUNA_DIAGNOSTIC_45 C_NO_KLEIDIAI)
set(CMAKE_CXX_FLAGS [=[-DNAME="quoted" -O3]=])
set(CMAKE_CURRENT_BINARY_DIR "'''+str(root)+'''")
include("'''+str(Path('patches/diagnostic46/metadata.cmake').resolve())+'''")
''')
    cmake=shutil.which('cmake') or os.environ.get('HARUNA_CMAKE')
    if cmake:
        subprocess.run([cmake,'-P',str(fixture)],check=True)
        data=json.loads((root/'haruna46_effective.json').read_text())
        assert data['cxxFlags']=='-DNAME="quoted" -O3' and data['variant']=='C_NO_KLEIDIAI'
    else:print('SKIP local CMake serialization: toolchain unavailable; mandatory in CI after SDK setup.')
print('PASS: one primary change per experiment, E architecture unset, F dependency explicit, mandatory size/SHA gates, immutable evidence paths and evidence safety. CMake serialization checked when toolchain exists. No model/inference executed.')
