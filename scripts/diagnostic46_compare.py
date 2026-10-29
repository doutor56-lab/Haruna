"""Read-only comparison using the exact 4.5 token/logit comparator; no invented inference results."""
import argparse
import json
from pathlib import Path
from diagnostic45_compare import read_run,compare


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('a');parser.add_argument('b');parser.add_argument('--reference-a');parser.add_argument('--reference-b')
    parser.add_argument('--output',required=True)
    args=parser.parse_args();target=Path(args.output)
    if target.exists():raise SystemExit('New result path required; references are never overwritten')
    a,b=read_run(args.a),read_run(args.b)
    result=compare(a,b,read_run(args.reference_a) if args.reference_a else None,read_run(args.reference_b) if args.reference_b else None)
    result['provenance']={}
    for label,run in (('a',a),('b',b)):
        result['provenance'][label]={'build':run['meta'].get('build46'),'apkSha256':run['identity'].get('apkSha256'),
            'reference45WithoutApkIdentity':not bool(run['identity'].get('apkSha256'))}
    result['meaning']='Observed ID/logit difference only. No automatic causal/kernel/quality conclusion.'
    with target.open('x',encoding='utf-8') as file:json.dump(result,file,ensure_ascii=False,indent=2)
    print('FIRST_DIVERGENCE =',result['FIRST_DIVERGENCE'])
    for value in result['numeric']:print(json.dumps(value,ensure_ascii=False))


if __name__=='__main__':main()
