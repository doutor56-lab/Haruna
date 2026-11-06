"""Build upstream mtmd beside the existing llama target; no duplicate llama/GGML."""
from pathlib import Path
r=Path('third_party/llama.cpp/examples/llama.android/lib/src/main/cpp')
p=r/'CMakeLists.txt';s=p.read_text()
if 'HARUNA_STAGE8_VISION' not in s:
 needle='add_subdirectory(${LLAMA_SRC} build-llama)'
 assert needle in s
 s=s.replace(needle,'# HARUNA_STAGE8_VISION: the existing pinned runtime provides standalone libmtmd.\nset(LLAMA_BUILD_MTMD ON CACHE BOOL "" FORCE)\nset(MTMD_VIDEO OFF CACHE BOOL "" FORCE)\n'+needle)
 s+='\n# HARUNA_STAGE8_VISION\ntarget_sources(${CMAKE_PROJECT_NAME} PRIVATE ${LLAMA_SRC}/../../app/src/main/cpp/vision/haruna_vision.cpp)\ntarget_link_libraries(${CMAKE_PROJECT_NAME} mtmd)\n'
 p.write_text(s)
print('Enabled existing pinned mtmd library for stage8')
