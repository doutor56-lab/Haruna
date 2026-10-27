import {fold} from './schema.js';
import {readMemory} from '../essential/store.js';

// Conservative exclusion rules, not a complete detector of personal/sensitive information.
export function sensitive(text){
 const raw=String(text||''),value=fold(raw);
 if(/\b(?:meu nome|me chamo|me cham[ae] de|endereco|cpf|rg|passaporte|telefone|celular|senha|password|token|api.?key|chave privada|cartao|conta bancaria|pix|salario|renda|diagnostico|medicamento|remedio|diabetes|cancer|depressao|saude|sexual|intimidade)\b/.test(value))return true;
 if(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(raw)||/(?:\d[ .()+-]*){9,}/.test(raw)||/\b(?:sk-|ghp_|github_pat_)[a-z0-9_-]+/i.test(raw))return true;
 const e=readMemory().essential;
 return [e.userName,e.preferredName].some(name=>name?.length>=3&&value.includes(fold(name)));
}
