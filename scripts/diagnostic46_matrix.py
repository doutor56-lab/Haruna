"""Summarize REAL device evidence against A and B, without automatic blame or synthetic outputs."""
import argparse
import json
from pathlib import Path
from diagnostic45_compare import read_run,compare
from diagnostic46_profiles import BUILT


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence-root',required=True,help='One directory per variant; existing evidence is read-only')
    parser.add_argument('--output',required=True);parser.add_argument('--reference45-a');parser.add_argument('--reference45-b')
    args=parser.parse_args();target=Path(args.output)
    if target.exists():raise SystemExit('New output path required')
    root=Path(args.evidence_root);runs={}
    for mode in BUILT:
        if (root/mode).is_dir():runs[mode]=read_run(root/mode)
    result={'schema':46,'comparisons':{},'missing':[m for m in BUILT if m not in runs],
        'conclusion':'Device measurements only; differences do not automatically identify a faulty kernel.'}
    if 'A_CURRENT' not in runs or 'B_CONSERVATIVE' not in runs:raise SystemExit('A_CURRENT and B_CONSERVATIVE real controls required')
    for mode,run in runs.items():
        result['comparisons'][mode]={'versusA':compare(runs['A_CURRENT'],run),'versusB':compare(runs['B_CONSERVATIVE'],run)}
    for label,path,mode in [('reference45A',args.reference45_a,'A_CURRENT'),('reference45B',args.reference45_b,'B_CONSERVATIVE')]:
        if path:result[label]=compare(read_run(path),runs[mode])
    with target.open('x',encoding='utf-8') as file:json.dump(result,file,ensure_ascii=False,indent=2)
    print('Saved observed evidence matrix; no automatic causal ranking:',target)


if __name__=='__main__':main()
