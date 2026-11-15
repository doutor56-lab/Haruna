// Shared, offline credits. Read live status when opened; never infer suppliers from filenames.
const settings=document.querySelector('#settingsView');
if(settings){
 const section=document.createElement('section');section.className='page-card';
 const details=document.createElement('details'),title=document.createElement('summary');title.textContent='Sobre a Haruna · créditos e licenças';details.append(title);section.append(details);settings.append(section);
 let config;
 const render=async()=>{
  if(!details.open)return;
  try{
   config??=window.HarunaAndroid?.getIdentityDetails?JSON.parse(window.HarunaAndroid.getIdentityDetails()):await (await fetch(new URL('./config.json',import.meta.url))).json();
   const body=document.createElement('div');
   const line=(label,value)=>{const p=document.createElement('p');p.className='settings-note';p.textContent=label+': '+value;body.append(p)};
   line('Aplicativo',config.name);line('Desenvolvedor do aplicativo',config.developer);
   const status=JSON.parse(window.HarunaAndroid?.getStatus?.()||'{}'),m=status.modelLoaded?status.modelMetadata||{}:{};
   line('Modelo de linguagem carregado',status.modelLoaded?(status.modelName||'Identificador indisponível'):'Nenhum');
   line('Fornecedor / autor informado pelo GGUF',m.organization||m.author||'Não informado; não inferido pelo nome do arquivo');
   for(const [key,label]of [['name','Nome declarado no GGUF'],['author','Autor declarado no GGUF'],['organization','Organização declarada no GGUF'],['license','Licença declarada do modelo'],['url','Fonte declarada do modelo']])line(label,m[key]||'Não informado');
   line('Origem','Metadados são declarações do arquivo; podem identificar seu conversor. Nome de arquivo não comprova quem treinou o modelo. Proxys Labs desenvolve a Haruna e não reivindica treinamento ou propriedade dos modelos de terceiros, nem parceria ou afiliação com seus fornecedores.');
   for(const credit of config.credits||[])line(credit.name,credit.license);
   const licenses=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Ler licenças e avisos incluídos';licenses.append(summary);body.append(licenses);
   for(const file of config.licenseFiles||[]){
    const item=document.createElement('details'),label=document.createElement('summary');label.textContent=file;item.append(label);licenses.append(item);
    item.addEventListener('toggle',async()=>{if(!item.open||item.querySelector('pre'))return;const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font:inherit';item.append(pre);try{const base=window.HarunaDesktop?'../licenses/':'../../licenses/';const response=await fetch(new URL(base+file,import.meta.url));if(!response.ok)throw Error();pre.textContent=await response.text()}catch{pre.textContent='Não foi possível abrir este aviso local.'}});
   }
   details.replaceChildren(title,body);
  }catch{details.replaceChildren(title);const p=document.createElement('p');p.textContent='Informações de identidade indisponíveis.';details.append(p)}
 };
 details.addEventListener('toggle',render);window.addEventListener('haruna-native-status-changed',render);
}
