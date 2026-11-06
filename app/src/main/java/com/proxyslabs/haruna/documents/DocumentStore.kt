package com.proxyslabs.haruna.documents

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.UUID

/** Additive database: never migrates the existing chats or knowledge IndexedDB. */
class DocumentStore(context:Context):SQLiteOpenHelper(context,"haruna_documents_v1.db",null,1){
    val root=File(context.filesDir,"document-library").apply{mkdirs()}
    var indexKind="";private set
    override fun onCreate(db:SQLiteDatabase){
        db.execSQL("CREATE TABLE documents(id TEXT PRIMARY KEY,name TEXT NOT NULL,format TEXT NOT NULL,sha TEXT UNIQUE NOT NULL,path TEXT NOT NULL,pages INTEGER DEFAULT 0,sections INTEGER DEFAULT 0,chars INTEGER DEFAULT 0,state TEXT NOT NULL,active INTEGER DEFAULT 1,retained INTEGER DEFAULT 1,created INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE pages(doc TEXT NOT NULL,section INTEGER NOT NULL,page INTEGER,kind TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(doc,section))")
        db.execSQL("CREATE TABLE chunks(id INTEGER PRIMARY KEY,doc TEXT NOT NULL,section INTEGER NOT NULL,page INTEGER,kind TEXT NOT NULL,body TEXT NOT NULL,digest TEXT NOT NULL)")
        db.execSQL("CREATE INDEX chunks_doc ON chunks(doc,section)")
        db.execSQL("CREATE TABLE links(path TEXT PRIMARY KEY,doc TEXT NOT NULL)")
        try{db.execSQL("CREATE VIRTUAL TABLE document_fts USING fts5(body,tokenize='unicode61 remove_diacritics 2')");indexKind="FTS5"}
        catch(_:android.database.sqlite.SQLiteException){db.execSQL("CREATE VIRTUAL TABLE document_fts USING fts4(body,tokenize=unicode61)");indexKind="FTS4"}
    }
    override fun onOpen(db:SQLiteDatabase){super.onOpen(db);db.rawQuery("SELECT sql FROM sqlite_master WHERE name='document_fts'",null).use{if(it.moveToFirst())indexKind=if(it.getString(0).contains("fts5",true))"FTS5" else "FTS4"}}
    override fun onUpgrade(db:SQLiteDatabase,oldVersion:Int,newVersion:Int){error("Migração de documentos não definida")}
    data class Doc(val id:String,val name:String,val format:String,val path:String,val state:String)
    fun doc(id:String):Doc=readableDatabase.rawQuery("SELECT id,name,format,path,state FROM documents WHERE id=?",arrayOf(id)).use{require(it.moveToFirst()){ "Documento não encontrado" };Doc(it.getString(0),it.getString(1),it.getString(2),it.getString(3),it.getString(4))}
    fun byHash(sha:String):Doc?=readableDatabase.rawQuery("SELECT id,name,format,path,state FROM documents WHERE sha=?",arrayOf(sha)).use{if(it.moveToFirst())Doc(it.getString(0),it.getString(1),it.getString(2),it.getString(3),it.getString(4))else null}
    fun register(name:String,format:String,sha:String,file:File,retained:Boolean=true):Doc{
        val id=UUID.randomUUID().toString();writableDatabase.insertOrThrow("documents",null,ContentValues().apply{put("id",id);put("name",name.take(180));put("format",format);put("sha",sha);put("path",file.absolutePath);put("state","INSTALLED");put("retained",if(retained)1 else 0);put("active",if(retained)1 else 0);put("created",System.currentTimeMillis())});return doc(id)
    }
    private fun clearIndex(db:SQLiteDatabase,id:String){db.execSQL("DELETE FROM document_fts WHERE rowid IN(SELECT id FROM chunks WHERE doc=?)",arrayOf(id));db.delete("chunks","doc=?",arrayOf(id));db.delete("pages","doc=?",arrayOf(id))}
    fun begin(id:String){val db=writableDatabase;db.beginTransaction();try{clearIndex(db,id);db.execSQL("UPDATE documents SET state='PROCESSING',chars=0,sections=0 WHERE id=?",arrayOf(id));db.setTransactionSuccessful()}finally{db.endTransaction()}}
    fun page(id:String,section:Int,number:Int?,kind:String,text:String){
        require(text.length<=2_000_000){"Página excessivamente grande"};val db=writableDatabase;db.beginTransaction()
        try{val old=db.rawQuery("SELECT length(body) FROM pages WHERE doc=? AND section=?",arrayOf(id,section.toString())).use{if(it.moveToFirst())it.getInt(0)else null};db.execSQL("DELETE FROM document_fts WHERE rowid IN(SELECT id FROM chunks WHERE doc=? AND section=?)",arrayOf<Any>(id,section));db.delete("chunks","doc=? AND section=?",arrayOf(id,section.toString()));db.delete("pages","doc=? AND section=?",arrayOf(id,section.toString()));db.insertOrThrow("pages",null,ContentValues().apply{put("doc",id);put("section",section);if(number!=null)put("page",number);put("kind",kind);put("body",text)})
            var start=0;while(start<text.length){var end=minOf(text.length,start+900);if(end<text.length){val cut=maxOf(text.lastIndexOf("\n",end),text.lastIndexOf(". ",end));if(cut>start+500)end=cut+1};val body=text.substring(start,end).trim()
                if(body.isNotEmpty()){val digest=sha(body.replace(Regex("\\s+")," ").toByteArray());val row=db.insertOrThrow("chunks",null,ContentValues().apply{put("doc",id);put("section",section);if(number!=null)put("page",number);put("kind",kind);put("body",body);put("digest",digest)});db.execSQL("INSERT INTO document_fts(rowid,body) VALUES(?,?)",arrayOf<Any>(row,body))}
                if(end>=text.length)break;start=maxOf(start+1,end-120)
            };db.execSQL("UPDATE documents SET chars=chars+?,sections=sections+? WHERE id=?",arrayOf<Any>(text.length-(old?:0),if(old==null)1 else 0,id));db.setTransactionSuccessful()
        }finally{db.endTransaction()}
    }
    fun finish(id:String,pages:Int,state:String="READY"){require(state in listOf("READY","PARTIAL","ERROR","CANCELLED"));writableDatabase.execSQL("UPDATE documents SET state=?,pages=? WHERE id=?",arrayOf<Any>(state,pages,id))}
    fun list():JSONArray{val out=JSONArray();readableDatabase.rawQuery("SELECT id,name,format,pages,sections,chars,state,active,created,(SELECT count(*) FROM chunks WHERE doc=documents.id),retained FROM documents ORDER BY created DESC",null).use{c->while(c.moveToNext()){val id=c.getString(0);out.put(JSONObject().put("id","native:$id").put("nativeDocId",id).put("name",c.getString(1)).put("format",c.getString(2)).put("pages",c.getInt(3)).put("sections",c.getInt(4)).put("chars",c.getLong(5)).put("state",c.getString(6)).put("active",c.getInt(7)==1&&c.getString(6) in listOf("READY","PARTIAL")).put("createdAt",c.getLong(8)).put("type","knowledge").put("retained",c.getInt(10)==1).put("chunks",c.getInt(9)).put("importance",50).put("confidence",70).put("source","native_document"))}};return out}
    private fun queryTerms(query:String)=Regex("[\\p{L}\\p{N}]{3,}").findAll(query.lowercase()).map{it.value}.filter{it !in setOf("que","uma","para","com","dos","das","por","como","este","esta","isso","sobre","qual","quais","arquivo","documento")}.distinct().take(16).toList()
    fun search(query:String,limit:Int=5,document:String?=null):JSONArray{
        val terms=queryTerms(query);if(terms.isEmpty())return JSONArray();val match=terms.joinToString(" OR "){"\"$it\""}
        val args=mutableListOf(match);if(document!=null)args.add(document)
        val hits=mutableListOf<JSONObject>();val order=if(indexKind=="FTS5")"bm25(document_fts)" else "c.id DESC"
        readableDatabase.rawQuery("SELECT c.id,c.doc,c.page,c.kind,c.body,c.digest,d.name,c.section FROM document_fts JOIN chunks c ON c.id=document_fts.rowid JOIN documents d ON d.id=c.doc WHERE document_fts MATCH ? AND d.state IN('READY','PARTIAL')"+(if(document!=null)" AND d.id=?"else " AND d.active=1 AND d.retained=1")+" ORDER BY $order LIMIT 100",args.toTypedArray()).use{c->while(c.moveToNext()){val body=c.getString(4);val score=terms.count{body.contains(it,true)}.toDouble();hits.add(JSONObject().put("id","native:${c.getLong(0)}").put("docId","native:${c.getString(1)}").put("name",c.getString(6)).put("page",if(c.isNull(2))JSONObject.NULL else c.getInt(2)).put("section",c.getInt(7)).put("kind",c.getString(3)).put("content",body).put("digest",c.getString(5)).put("score",maxOf(1.0,score)).put("type","knowledge"))}}
        return JSONArray(hits.distinctBy{it.getString("digest")+it.optString("page")}.sortedByDescending{it.getDouble("score")}.take(limit.coerceIn(1,20)))
    }
    fun preview(id:String,section:Int):JSONObject=readableDatabase.rawQuery("SELECT page,kind,body FROM pages WHERE doc=? AND section=?",arrayOf(id,section.toString())).use{require(it.moveToFirst()){ "Trecho não encontrado" };JSONObject().put("page",if(it.isNull(0))JSONObject.NULL else it.getInt(0)).put("kind",it.getString(1)).put("text",it.getString(2).take(16000)).put("truncated",it.getString(2).length>16000).also{out->for((key,cmp,order) in listOf(Triple("previous","<","DESC"),Triple("next",">","ASC")))readableDatabase.rawQuery("SELECT section FROM pages WHERE doc=? AND section $cmp ? ORDER BY section $order LIMIT 1",arrayOf(id,section.toString())).use{c->out.put(key,if(c.moveToFirst())c.getInt(0)else JSONObject.NULL)}}}
    fun retain(id:String){writableDatabase.execSQL("UPDATE documents SET retained=1,active=1 WHERE id=?",arrayOf(id))}
    fun forget(path:String){val d=linked(path)?:return;val db=writableDatabase;db.delete("links","path=?",arrayOf(path));val orphan=db.rawQuery("SELECT 1 FROM documents WHERE id=? AND retained=0 AND NOT EXISTS(SELECT 1 FROM links WHERE doc=?)",arrayOf(d.id,d.id)).use{it.moveToFirst()};if(orphan)remove(d.id)}
    fun toggle(id:String){writableDatabase.execSQL("UPDATE documents SET active=CASE WHEN retained=0 THEN 1 ELSE 1-active END,retained=1 WHERE id=?",arrayOf(id))}
    fun remove(id:String){val item=doc(id);val file=File(item.path);require(file.parentFile?.canonicalFile==root.canonicalFile);val db=writableDatabase;db.beginTransaction();try{clearIndex(db,id);db.delete("documents","id=?",arrayOf(id));db.delete("links","doc=?",arrayOf(id));db.setTransactionSuccessful()}finally{db.endTransaction()};File(root,"$id.preview.png").delete();check(!file.exists()||file.delete()){ "Índice removido, mas o arquivo não pôde ser excluído" }}
    fun recover(){writableDatabase.execSQL("UPDATE documents SET state=CASE WHEN sections>0 THEN 'PARTIAL' ELSE 'INSTALLED' END WHERE state='PROCESSING'")}
    fun link(path:String,id:String){writableDatabase.insertWithOnConflict("links",null,ContentValues().apply{put("path",path);put("doc",id)},SQLiteDatabase.CONFLICT_REPLACE)}
    fun linked(path:String):Doc?=readableDatabase.rawQuery("SELECT doc FROM links WHERE path=?",arrayOf(path)).use{if(it.moveToFirst())runCatching{doc(it.getString(0))}.getOrNull()else null}
    fun context(id:String,query:String):JSONArray{val hits=search(query,5,id);if(hits.length()>0)return hits;val out=JSONArray();readableDatabase.rawQuery("SELECT c.id,c.page,c.kind,c.body,c.digest,d.name,c.section FROM chunks c JOIN documents d ON d.id=c.doc WHERE c.doc=? AND d.state IN('READY','PARTIAL') ORDER BY (c.kind='vision') DESC,c.section,c.id LIMIT 5",arrayOf(id)).use{c->while(c.moveToNext())out.put(JSONObject().put("id","native:${c.getLong(0)}").put("docId","native:$id").put("name",c.getString(5)).put("page",if(c.isNull(1))JSONObject.NULL else c.getInt(1)).put("kind",c.getString(2)).put("content",c.getString(3)).put("digest",c.getString(4)).put("section",c.getInt(6)).put("type","knowledge").put("score",1))};return out}
    companion object{fun sha(bytes:ByteArray)=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)}}
}
