/**
 * The only JavaScript the page needs: one small inline script for the copy buttons. Everything else
 * is HTML and CSS, so the page is complete without the framework runtime (and in previews that strip it).
 */
export const uiBehaviour = `(function(){document.addEventListener('click',function(e){var el=e.target instanceof Element?e.target:null;if(!el)return;var b=el.closest('[data-copy]');if(!b)return;var text=b.getAttribute('data-copy')||'';var done=function(){b.setAttribute('data-copied','');setTimeout(function(){b.removeAttribute('data-copied')},1400)};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done,function(){})}})})();`;
