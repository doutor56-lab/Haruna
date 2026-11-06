"""Exercise the production schema/query SQL on real host SQLite, not an Android device test."""
import re,sqlite3
from pathlib import Path
source=Path('app/src/main/java/com/proxyslabs/haruna/documents/DocumentStore.kt').read_text()
commands=re.findall(r'(?:db|writableDatabase)\.execSQL\("([^"\n]+)"',source)
for engine in ['fts5','fts4']:
 db=sqlite3.connect(':memory:')
 for sql in commands:
  if sql.startswith('CREATE ') and ('VIRTUAL TABLE' not in sql or engine in sql):db.execute(sql)
 for id,active,retained,page in [('library',1,1,2),('attached',0,0,7)]:
  db.execute("INSERT INTO documents(id,name,format,sha,path,pages,sections,chars,state,active,retained,created)VALUES(?,?, 'pdf',?,?,10,1,30,'READY',?,?,1)",(id,id+'.pdf',id,'/fixture/'+id,active,retained))
  db.execute('INSERT INTO pages VALUES(?,?,?,?,?)',(id,1,page,'pdf_text','Fotossíntese utiliza luz.'))
  cur=db.execute('INSERT INTO chunks(doc,section,page,kind,body,digest)VALUES(?,?,?,?,?,?)',(id,1,page,'pdf_text','Fotossíntese utiliza luz.',id))
  db.execute('INSERT INTO document_fts(rowid,body)VALUES(?,?)',(cur.lastrowid,'Fotossíntese utiliza luz.'))
 order='bm25(document_fts)' if engine=='fts5' else 'c.id DESC'
 query="SELECT c.doc,c.page FROM document_fts JOIN chunks c ON c.id=document_fts.rowid JOIN documents d ON d.id=c.doc WHERE document_fts MATCH ? AND d.state IN('READY','PARTIAL') AND d.active=1 AND d.retained=1 ORDER BY "+order
 assert db.execute(query,('fotossintese',)).fetchall()==[('library',2)]
 toggle=next(x for x in commands if x.startswith('UPDATE documents SET active=CASE'))
 db.execute(toggle,('attached',));assert len(db.execute(query,('fotossintese',)).fetchall())==2
 db.execute(toggle,('attached',));assert db.execute(query,('fotossintese',)).fetchall()==[('library',2)]
 delete=next(x for x in commands if x.startswith('DELETE FROM document_fts WHERE rowid IN(SELECT id FROM chunks WHERE doc=?)'))
 db.execute(delete,('library',));db.execute('DELETE FROM chunks WHERE doc=?',('library',));assert not db.execute(query,('fotossintese',)).fetchall()
 db.close();print('PASS real host SQLite '+engine+': accent search, real page, attachment isolation, explicit promotion/pause, index removal')
