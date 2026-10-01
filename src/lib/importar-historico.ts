import { MAX_COMPRAS_LOTE, MAX_CONTRATOS_LOTE } from "./catalogo-validation";
import type { CompraHistorico, ContratoHistorico } from "./historico-compra-core";
import { apagarCatalogo, postCatalogo } from "./importar-catalogo";

/**
 * Envio do HISTÓRICO DE COMPRA em LOTES — roda NO NAVEGADOR. O 1º pedido cria o catálogo (tipo 'historico') com o 1º
 * lote de contratos; depois os demais contratos e os itens (lotes idempotentes — `postCatalogo` repete falhas de rede e
 * 5xx). Tudo ou nada: se um lote falhar de vez, o catálogo criado agora é apagado.
 */
export async function enviarHistoricoEmLotes(
  meta: { nome: string; pastaId: number | null },
  contratos: readonly ContratoHistorico[],
  itens: readonly CompraHistorico[],
  onProgresso?: (feitos: number, total: number) => void,
): Promise<{ catalogoId: number }> {
  const total = contratos.length + itens.length;
  let feitos = Math.min(MAX_CONTRATOS_LOTE, contratos.length);
  const j = await postCatalogo({ mode: "start-historico", nome: meta.nome, pastaId: meta.pastaId, totalItens: itens.length, contratos: contratos.slice(0, MAX_CONTRATOS_LOTE) });
  const catalogoId = Number(j.catalogoId);
  onProgresso?.(feitos, total);
  try {
    for (let i = MAX_CONTRATOS_LOTE; i < contratos.length; i += MAX_CONTRATOS_LOTE) {
      const lote = contratos.slice(i, i + MAX_CONTRATOS_LOTE);
      await postCatalogo({ mode: "append-historico", catalogoId, contratos: lote });
      feitos += lote.length;
      onProgresso?.(feitos, total);
    }
    for (let i = 0; i < itens.length; i += MAX_COMPRAS_LOTE) {
      const lote = itens.slice(i, i + MAX_COMPRAS_LOTE);
      await postCatalogo({ mode: "append-historico", catalogoId, rows: lote });
      feitos += lote.length;
      onProgresso?.(feitos, total);
    }
  } catch (e) {
    await apagarCatalogo(catalogoId);
    throw e;
  }
  return { catalogoId };
}
