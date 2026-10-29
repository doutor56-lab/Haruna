"""Four independent controls. F is intentionally rejected, never silently coupled."""
LLAMA='7894e8b92481a8bb8ffe94f73b656ffe0dd01e10'
INITIAL='8c141aa016025940125ee8c368678e3146cd804b'
BASE={'GGML_CPU_KLEIDIAI':'ON','GGML_CPU_REPACK':'ON','GGML_CPU_ALL_VARIANTS':'ON','GGML_CPU_ARM_ARCH':''}
CHANGES={
    'A_CURRENT':{},
    'B_CONSERVATIVE':{'GGML_CPU_KLEIDIAI':'OFF','GGML_CPU_REPACK':'OFF','GGML_CPU_ALL_VARIANTS':'OFF','GGML_CPU_ARM_ARCH':'armv8-a'},
    'C_NO_KLEIDIAI':{'GGML_CPU_KLEIDIAI':'OFF'},
    'D_NO_REPACK':{'GGML_CPU_REPACK':'OFF'},
    'E_NO_ALL_VARIANTS':{'GGML_CPU_ALL_VARIANTS':'OFF'},
    'F_ARMV8A_ONLY':{'GGML_CPU_ARM_ARCH':'armv8-a'},
}
BUILT=list(CHANGES)[:-1]
DEPENDENCY='Pinned ggml/src/CMakeLists.txt rejects GGML_CPU_ARM_ARCH with GGML_CPU_ALL_VARIANTS=ON: Cannot use both GGML_CPU_ARM_ARCH and GGML_CPU_ALL_VARIANTS. Disabling ALL_VARIANTS would add a second independent change from A.'

def expected(mode):return dict(BASE,**CHANGES[mode])
