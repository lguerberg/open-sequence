/**
 * The only JavaScript the page needs, as two small inline scripts. Everything else is HTML and CSS,
 * so the page is complete without the framework runtime (and in previews that strip it).
 */

/** Runs in <head> before paint: dark unless the visitor chose light. */
export const themeInit = `(function(){var t=null;try{t=localStorage.getItem('oseq-theme')}catch(e){}var d=document.documentElement;if(t==='light'){d.classList.remove('dark');d.classList.add('light')}else{d.classList.add('dark');d.classList.remove('light')}})();`;

/** Theme toggle and copy buttons, by delegation. */
export const uiBehaviour = `(function(){document.addEventListener('click',function(e){var el=e.target instanceof Element?e.target:null;if(!el)return;var tg=el.closest('[data-theme-toggle]');if(tg){var d=document.documentElement;var dark=!d.classList.contains('dark');d.classList.toggle('dark',dark);d.classList.toggle('light',!dark);try{localStorage.setItem('oseq-theme',dark?'dark':'light')}catch(_){}return}var b=el.closest('[data-copy]');if(b){var text=b.getAttribute('data-copy')||'';var done=function(){b.setAttribute('data-copied','');setTimeout(function(){b.removeAttribute('data-copied')},1400)};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done,function(){})}}})})();`;
