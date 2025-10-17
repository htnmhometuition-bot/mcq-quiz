(function(){
window.$ = (sel) => document.querySelector(sel);
window.$$ = (sel) => Array.from(document.querySelectorAll(sel));
window.shuffle = (arr) => arr.map(v => [Math.random(), v]).sort((a,b)=>a[0]-b[0]).map(v=>v[1]);
window.escapeHTML = (str) => String(str ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
})();