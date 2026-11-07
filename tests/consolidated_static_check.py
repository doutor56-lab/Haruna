from pathlib import Path
import re,hashlib
root=Path('app/src/main/assets/haruna')
index=(root/'index.html').read_text();nav=index[index.index('<nav class="bottom-nav"'):index.index('</nav>',index.index('<nav class="bottom-nav"'))]
assert re.findall('data-view="([^"]+)"',nav)==['chat','library','memory','settings']
css=(root/'consolidated.css').read_text()
# User authorized panel typography; original chat/header/navigation CSS stays intact.
for selectors,body in re.findall(r'([^{}]+)\{([^{}]*)\}', re.sub(r'/\*.*?\*/','',css,flags=re.S)):
 if 'font-size:' in body:
  assert all(x.strip().startswith(('.image-','#localModels')) for x in selectors.split(',')),selectors
for name,expected in {'style.css': '345f6a63a1135896afe5120801841ee952a80238497d5357070cb9218bb029d0', 'premium.css': '1245db39db677ae73f4d1ef316488be047f86c6046be10acff9675402bc05457', 'theme.css': '9a1df2ea095ce176883bc25080a919ef07efe11d0fbefb474be7c949325e94fd'}.items():
 assert hashlib.sha256((root/name).read_bytes()).hexdigest()==expected
source=(root/'diagnostics/panel.js').read_text();assert 'haruna-memory-observation' in source and 'requestSnapshot(ticket)' in source
assert 'setInterval' not in (root/'local-models.js').read_text()
assert 'Gerar imagem' not in (root/'image-controls.js').read_text()
print('PASS navigation order; base CSS unchanged; typography scoped to image panel; shared DBG sampler; no generate button in image settings')
