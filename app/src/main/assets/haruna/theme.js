const THEME_KEY='haruna_theme_v1';
const root=document.documentElement;
const meta=document.querySelector('meta[name="theme-color"]');
const systemDark=()=>window.matchMedia?.('(prefers-color-scheme: dark)').matches;
function savedTheme(){try{return localStorage.getItem(THEME_KEY)||'dark'}catch{return'dark'}}
function resolvedTheme(choice){return choice==='system'?(systemDark()?'dark':'light'):choice}
function applyTheme(choice,persist=true){const safe=['dark','light','system'].includes(choice)?choice:'dark';const resolved=resolvedTheme(safe);root.dataset.theme=resolved;root.dataset.themeChoice=safe;if(meta)meta.content=resolved==='light'?'#f8f8fd':'#080c17';document.querySelectorAll('[data-theme-option]').forEach(b=>{b.classList.toggle('active',b.dataset.themeOption===safe);b.setAttribute('aria-pressed',String(b.dataset.themeOption===safe))});if(persist){try{localStorage.setItem(THEME_KEY,safe)}catch{}}}
applyTheme(savedTheme(),false);
document.addEventListener('click',e=>{const button=e.target.closest('[data-theme-option]');if(button)applyTheme(button.dataset.themeOption)});
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(savedTheme()==='system')applyTheme('system',false)});
document.addEventListener('DOMContentLoaded',()=>applyTheme(savedTheme(),false));

