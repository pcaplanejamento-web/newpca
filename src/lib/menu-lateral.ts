// Menu lateral RECOLHIDO (trilho de ícones) — a preferência da pessoa NESTE navegador. O trecho roda antes da 1ª pintura
// e põe o atributo no <html> (o CSS decide tudo — sem piscar nem animar ao carregar).
export const CHAVE_MENU = "menu:recolhido";
export const ATRIBUTO_MENU = "data-menu-recolhido";
export const SCRIPT_MENU = `(function(){try{if(localStorage.getItem(${JSON.stringify(CHAVE_MENU)})==="1")document.documentElement.setAttribute(${JSON.stringify(ATRIBUTO_MENU)},"")}catch(_){}})();`;
