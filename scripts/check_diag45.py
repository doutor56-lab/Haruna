"""Focused synthetic checks of the comparator, not evidence from a model/device."""
import array
import copy
import importlib.util
from pathlib import Path
import tempfile

spec=importlib.util.spec_from_file_location('compare45',Path(__file__).with_name('diagnostic45_compare.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as temp:
    common={'modelSha256':'same'}
    runtime={key:0 for key in ('nCtx','nBatch','nUbatch','nSeqMax','threads','threadsBatch','kvK','kvV',
        'flashRequested','flashEffective','gpuTransformerLayers','architecture','fileType','llamaCommit')}
    meta={'runtime':runtime,'testMode':'fixture','decisionProbe':{'sampler':{}}}
    a={'root':Path(temp)/'a','identity':common,'meta':meta,'input':{},'result':{'kernels':{}},
       'tokens':[{'id':x,'index':i} for i,x in enumerate([1,2,3,4,5,6],1)]}
    b=copy.deepcopy(a);b['root']=Path(temp)/'b';b['tokens'][4]['id']=9
    assert m.compare(a,b)['FIRST_DIVERGENCE']==5
    assert m.compare(a,a)['FIRST_DIVERGENCE'] is None
    assert m.compare(a,b)['nextCaptureIndices']==[4,5]
    for r,values in ((a,[1.,2.,3.,float('nan'),float('inf')]),(b,[2.,4.,3.,0.,0.])):
        r['root'].mkdir();r['tokens'][4].update(logitsFile='logits-5.f32',vocabSize=5)
        (r['root']/'logits-5.f32').write_bytes(array.array('f',values).tobytes())
    n=m.numeric(a,b,5)
    assert n['valid'] and n['max_abs_diff']==2 and n['mean_abs_diff']==1
    assert n['nan_pairs']==1 and n['inf_pairs']==1 and n['finite_pairs']==3
    b['tokens'][2]['id']=99
    assert not m.numeric(a,b,5)['valid']
    try:m.compare(a,b,reference_b=a)
    except ValueError:pass
    else:raise AssertionError('Replay mismatch accepted')
    b['identity']={'modelSha256':'different'}
    try:m.compare(a,b)
    except ValueError:pass
    else:raise AssertionError('Different model accepted')
print('PASS: exact first divergence, bounded replay points, numerical max/mean/RMS/nonfinite counts, conditioning/replay/model rejection.')
