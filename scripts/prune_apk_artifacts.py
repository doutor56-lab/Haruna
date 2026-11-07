"""One authorized cleanup of Actions APK artifacts, preserving current + four runs."""
import json
import os
import re
import sys
import urllib.request


def plan(artifacts, current):
    apks = [a for a in artifacts if not a.get('expired') and re.fullmatch(r'haruna[-_].*[-_]apk', a['name'], re.I) and a.get('workflow_run', {}).get('id')]
    current_apks = [a for a in apks if a['workflow_run']['id'] == current]
    if not current_apks:
        raise ValueError('Current APK not published; refusing cleanup')
    cutoff = max(a['created_at'] for a in current_apks)
    previous = sorted((a for a in apks if a['workflow_run']['id'] != current and a['created_at'] < cutoff), key=lambda a: (a['created_at'], a['id']), reverse=True)
    keep = {current}
    for a in previous:
        if len(keep) < 5:
            keep.add(a['workflow_run']['id'])
    return [a for a in previous if a['workflow_run']['id'] not in keep]


def main():
    if '--self-test' in sys.argv:
        rows = [dict(id=i, name='Haruna-ARM64-APK', created_at=f'2026-11-{i:02d}', expired=False, workflow_run={'id': i}) for i in range(1, 8)]
        rows += [dict(id=99, name='Haruna-Source-and-Report', created_at='2026-10-01', workflow_run={'id': 99})]
        assert [a['id'] for a in plan(rows, 7)] == [2, 1]
        assert [a['id'] for a in plan(rows, 6)] == [1]  # preserve concurrent newer run
        try:
            plan(rows, 88)
            raise AssertionError('Missing current APK accepted')
        except ValueError:
            pass
        print('PASS retention: current + four previous, no source/Windows/model deletion, no cleanup without current APK')
        return
    repo = os.environ['GITHUB_REPOSITORY']
    if repo != 'doutor56-lab/Haruna':
        raise ValueError('Unexpected repository')
    token = os.environ['GH_TOKEN']
    def api(path, method='GET'):
        req = urllib.request.Request('https://api.github.com/repos/' + repo + path, method=method, headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})
        with urllib.request.urlopen(req, timeout=60) as response:
            data = response.read()
            return json.loads(data) if data else None
    artifacts = []
    page = 1
    while True:
        batch = api(f'/actions/artifacts?per_page=100&page={page}')['artifacts']
        artifacts.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    removed = []
    for a in plan(artifacts, int(os.environ['GITHUB_RUN_ID'])):
        api('/actions/artifacts/' + str(a['id']), 'DELETE')
        removed.append(dict(id=a['id'], name=a['name'], bytes=a['size_in_bytes'], run=a['workflow_run']['id']))
        print('Deleted old APK artifact:', a['id'], a['name'])
    report = dict(currentRun=int(os.environ['GITHUB_RUN_ID']), previousVersionsRetained=4, removed=removed, bytesRemoved=sum(a['bytes'] for a in removed))
    print(json.dumps(report))
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as f:
        f.write('\n## Authorized APK cleanup\nCurrent + four prior APK versions retained. Sources, reports, models and Windows artifacts preserved.\n\n```json\n' + json.dumps(report, indent=2) + '\n```\n')


if __name__ == '__main__':
    main()
