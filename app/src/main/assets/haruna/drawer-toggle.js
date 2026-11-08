// Independent navigation toggle: remains usable when optional ES modules or
// native Android bridges are unavailable (including browser UI previews).
(() => {
 const menu=document.getElementById('menu');
 const drawer=document.getElementById('drawer');
 const scrim=document.getElementById('scrim');
 const close=document.getElementById('closeMenu');
 if(!menu||!drawer||!scrim||!close)return;
 const wide=()=>window.matchMedia('(orientation: landscape) and (min-width: 800px) and (min-height: 350px)').matches;
 const sync=open=>{
  drawer.classList.toggle('open',open);
  menu.setAttribute('aria-expanded',String(open));
  menu.setAttribute('aria-label',open?'Fechar conversas':'Abrir conversas');
  scrim.hidden=!open||wide();
  document.documentElement.style.setProperty('--haruna-sidebar-width',open&&wide()?'clamp(200px,22vw,240px)':'0px');
 };
 const toggle=()=>sync(!drawer.classList.contains('open'));
 menu.addEventListener('click',toggle);
 close.addEventListener('click',()=>sync(false));
 scrim.addEventListener('click',()=>sync(false));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drawer.classList.contains('open'))sync(false)});
 window.addEventListener('resize',()=>{if(drawer.classList.contains('open'))sync(true)});
 menu.setAttribute('aria-controls','drawer');
 sync(false);
})();
