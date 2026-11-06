/* Mammoth parses DOCX. This worker only maps its documented AST to ordered text blocks. */
function text(n){if(n.type==='text')return n.value||'';if(n.type==='tab')return '\t';if(n.type==='break')return '\n';return(n.children||[]).map(text).join('')+(n.type==='paragraph'?'\n':'')}
self.onmessage=async e=>{try{const bytes=e.data.buffer;if(!(bytes instanceof ArrayBuffer)||bytes.byteLength>32*1024*1024)throw Error('DOCX inválido ou maior que 32 MiB');const blocks=[];let chars=0;
 const add=(value,heading)=>{chars+=value.length;if(chars>16*1024*1024)throw Error('Texto DOCX excede o limite seguro de 16 MiB');for(let p=0;p<value.length;p+=6000)blocks.push({text:value.slice(p,p+6000),heading})};
 const collect=node=>{for(const n of node.children||[]){if(n.type==='paragraph'){const value=text(n).trim();if(value)add(value,n.styleName||null)}else if(n.type==='table'){for(const row of n.children||[]){const value=(row.children||[]).map(c=>text(c).trim()).join(' | ');if(value.trim())add(value,'Tabela')}}else collect(n)}};
 await mammoth.convertToHtml({arrayBuffer:bytes},{transformDocument:doc=>{collect(doc);return doc},externalFileAccess:false,convertImage:()=>Promise.resolve([])});self.postMessage({blocks});
 }catch(error){self.postMessage({error:error.message||'DOCX inválido'})}};
