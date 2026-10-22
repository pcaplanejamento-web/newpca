// Menu lateral RECOLHIDO (trilho de ícones) — a preferência da pessoa NESTE navegador. O trecho roda antes da 1ª pintura
// e põe o atributo no <html> (o CSS decide tudo — sem piscar nem animar ao carregar).
export const CHAVE_MENU = "menu:recolhido";
export const ATRIBUTO_MENU = "data-menu-recolhido";
export const SCRIPT_MENU = `(function(){try{if(localStorage.getItem(${JSON.stringify(CHAVE_MENU)})==="1")document.documentElement.setAttribute(${JSON.stringify(ATRIBUTO_MENU)},"")}catch(_){}})();`;

/** A ação "Recolher ou expandir o menu" (pesquisa do sistema → o menu lateral). */
export const EVENTO_ALTERNAR_MENU = "menu-lateral:alternar";

/** O menu da TELA PÚBLICA começa como o ADM escolheu (vale só nela — a preferência guardada não muda). */
export const scriptMenuPublico = (recolhido: boolean) =>
  `document.documentElement.${recolhido ? `setAttribute(${JSON.stringify(ATRIBUTO_MENU)},"")` : `removeAttribute(${JSON.stringify(ATRIBUTO_MENU)})`};`;

/** Volta o atributo à preferência guardada neste aparelho (ao sair da tela pública). */
export function aplicarMenuGuardado() {
  let r = false;
  try {
    r = localStorage.getItem(CHAVE_MENU) === "1";
  } catch {
    /* sem armazenamento */
  }
  document.documentElement.toggleAttribute(ATRIBUTO_MENU, r);
}
