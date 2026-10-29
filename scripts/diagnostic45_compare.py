"""Bounded canonical A/B comparison. Standard library only; never infers coherence from regex."""
import argparse
import array
import json
import math
from pathlib import Path
import sys


def read_run(directory):
    root=Path(directory)
    def read(name): return json.loads((root/name).read_text())
    run={'root':root,'meta':read('metadata.json'),'input':read('input.json'),
         'identity':read('runner.json'),'result':read('result.json')}
    if run['result'].get('ok') is not True: raise ValueError('Incomplete/failed run: '+str(root))
    run['tokens']=[json.loads(line) for line in (root/'tokens.jsonl').read_text().splitlines() if line]
    if len(run['tokens'])!=run['result']['chosenTokens']:raise ValueError('Truncated token log')
    n=len(run['input']['tokens'])
    for i,t in enumerate(run['tokens'],1):
        if t['index']!=i or t['position']!=n+i-1 or t['seqId']!=0 or t['kvMax']!=t['position']-1:
            raise ValueError('Non-contiguous token/context position')
    if run['meta']['prefix']['reusedTokens']!=0 or not run['meta']['initialKVEmpty']:
        raise ValueError('Dirty initial context')
    if run['meta']['stability']['samplerSeed']!=424242:raise ValueError('Incorrect effective seed')
    if run['meta']['testMode']=='B_CONSERVATIVE':
        flags=run['meta']['cpuFeaturesCompiled']
        if flags.get('KLEIDIAI','0')=='1' or flags.get('REPACK','0')=='1':raise ValueError('Invalid conservative backend features')
        if run['result']['kernels']['kleidiaiThreadCalls'] or run['result']['kernels']['repackThreadCalls']:raise ValueError('Conservative backend executed optimized extra traits')
    return run


def comparable(a,b):
    if a['identity']['modelSha256']!=b['identity']['modelSha256']:raise ValueError('GGUF SHA-256 differs')
    for key in ('manufacturer','deviceModel','androidApi','abis'):
        if a['identity'].get(key)!=b['identity'].get(key):raise ValueError('Different device environment: '+key)
    if a['input']!=b['input']:raise ValueError('Canonical input/tokens differ')
    for key in ('nCtx','nBatch','nUbatch','nSeqMax','threads','threadsBatch','kvK','kvV',
                'flashRequested','flashEffective','gpuTransformerLayers','architecture','fileType','llamaCommit'):
        if key not in a['meta']['runtime'] or a['meta']['runtime'][key]!=b['meta']['runtime'].get(key):
            raise ValueError('Runtime configuration differs: '+key)
    if a['meta']['decisionProbe']['sampler']!=b['meta']['decisionProbe']['sampler']:
        raise ValueError('Sampler parameters/chain differ')


def numeric(a,b,index):
    # Logits at step i condition on generated tokens [1,i-1], never on token i.
    ta,tb=a['tokens'],b['tokens']
    if [t['id'] for t in ta[:index-1]]!=[t['id'] for t in tb[:index-1]]:
        return {'index':index,'valid':False,'reason':'Different conditioning histories'}
    if index>len(ta) or index>len(tb):return {'index':index,'valid':False,'reason':'Step unavailable'}
    names=[ta[index-1].get('logitsFile'),tb[index-1].get('logitsFile')]
    if not all(names):return {'index':index,'valid':False,'reason':'Capture not requested; replay at this step'}
    vectors=[]
    for run,name in zip((a,b),names):
        expected='logits-'+str(index)+'.f32'
        if name!=expected:raise ValueError('Unexpected capture filename')
        data=(run['root']/name).read_bytes()
        if len(data)%4:raise ValueError('Truncated float32 file')
        values=array.array('f');values.frombytes(data)
        if sys.byteorder!='little':values.byteswap()
        vectors.append(values)
    x,y=vectors
    if len(x)!=len(y) or len(x)!=ta[index-1]['vocabSize'] or len(y)!=tb[index-1]['vocabSize']:
        raise ValueError('Different vocabulary/vector size')
    finite=nan=inf=0;total=squares=maximum=0.0;argmax=None
    for token,(u,v) in enumerate(zip(x,y)):
        if math.isnan(u) or math.isnan(v):nan+=1;continue
        if not math.isfinite(u) or not math.isfinite(v):inf+=1;continue
        diff=abs(float(u)-float(v));finite+=1;total+=diff;squares+=diff*diff
        if diff>maximum:maximum=diff;argmax=token
    return dict(index=index,valid=True,finite_pairs=finite,nan_pairs=nan,inf_pairs=inf,
                max_abs_diff=maximum if finite else None,mean_abs_diff=total/finite if finite else None,
                rms_diff=math.sqrt(squares/finite) if finite else None,max_diff_token_id=argmax,
                interpretation='Finite pairs only; raw logits before decode. Magnitude alone does not prove a faulty kernel.')


def compare(a,b,reference_a=None,reference_b=None):
    comparable(a,b)
    aa=[t['id'] for t in a['tokens']];bb=[t['id'] for t in b['tokens']]
    k=next((i for i,(x,y) in enumerate(zip(aa,bb),1) if x!=y),None)
    if k is None and len(aa)!=len(bb):k=min(len(aa),len(bb))+1
    output={'schema':45,'FIRST_DIVERGENCE':k,'tokensA':len(aa),'tokensB':len(bb),
            'modeA':a['meta']['testMode'],'modeB':b['meta']['testMode'],
            'kernelsA':a['result']['kernels'],'kernelsB':b['result']['kernels'],
            'automaticClassification':'No quality judgment: coherence/degeneration must be reviewed by a human.'}
    if k:
        output['windowA']=a['tokens'][max(0,k-4):k+3];output['windowB']=b['tokens'][max(0,k-4):k+3]
    captures=sorted(set(t['index'] for t in a['tokens'] if 'logitsFile' in t)&
                    set(t['index'] for t in b['tokens'] if 'logitsFile' in t))
    for run,reference in ((a,reference_a),(b,reference_b)):
        if reference:
            comparable(run,reference)
            for point in captures:
                if [t['id'] for t in run['tokens'][:point-1]]!=[t['id'] for t in reference['tokens'][:point-1]]:
                    raise ValueError('Replay did not reproduce original prefix; numerical causal comparison rejected')
    output['numeric']=[numeric(a,b,point) for point in captures]
    output['nextCaptureIndices']=sorted(set((max(1,k-1),k))) if k and k<=512 else []
    return output


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('a');parser.add_argument('b');parser.add_argument('--reference-a');parser.add_argument('--reference-b')
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    result=compare(read_run(args.a),read_run(args.b),read_run(args.reference_a) if args.reference_a else None,
                   read_run(args.reference_b) if args.reference_b else None)
    Path(args.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print('FIRST_DIVERGENCE =',result['FIRST_DIVERGENCE'])
    print('Replay capture indices:',','.join(map(str,result['nextCaptureIndices'])))
    for n in result['numeric']:print(json.dumps(n,ensure_ascii=False))


if __name__=='__main__':main()
