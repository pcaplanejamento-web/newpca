/**
 * SEGURAR (arrastar uma coluna, um cartão, ajustar uma largura) — compartilhado pelas peças de arrasto (`EdicaoColunas`,
 * `useArrastoCartoes`).
 */
/** Enquanto o usuário SEGURA algo (arrastar uma coluna, ajustar a largura): nenhuma seleção de texto (bloqueia o
 * `selectstart` e limpa a que houver), nenhum arrasto NATIVO do navegador (`dragstart` de imagem/texto — ele cancelaria o
 * ponteiro: a coluna presa parava e a "imagem" do navegador seguia o mouse) e o cursor da ação no documento inteiro.
 * Devolve a função que desfaz. */
export function segurar(cursor: string): () => void {
  const corpo = document.body.style;
  const antes = { cursor: corpo.cursor, selecao: corpo.userSelect };
  const bloquear = (e: Event) => e.preventDefault();
  corpo.cursor = cursor;
  corpo.userSelect = "none";
  window.getSelection()?.removeAllRanges();
  document.addEventListener("selectstart", bloquear);
  document.addEventListener("dragstart", bloquear);
  return () => {
    corpo.cursor = antes.cursor;
    corpo.userSelect = antes.selecao;
    document.removeEventListener("selectstart", bloquear);
    document.removeEventListener("dragstart", bloquear);
  };
}
