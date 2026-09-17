import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { criarOrcamento, excluirOrcamento, getOrcamento, inserirOrcamentoItens } from "@/lib/orcamento";
import { orcamentoOpSchema } from "@/lib/orcamento-validation";

export const dynamic = "force-dynamic";

/**
 * Escrita de ORÇAMENTO em LOTES (só editor). `start-orcamento` cria um orçamento novo
 * (nome + ANO) e grava o 1º lote de lançamentos; `append-orcamento-itens` acrescenta os
 * demais. Somente leitura na UI — não há edição de lançamento.
 */
export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;

  const p = await parseCorpo(orcamentoOpSchema, req);
  if ("resp" in p) return p.resp;
  const d = p.data;

  if (d.mode === "append-orcamento-itens") {
    const orc = await getOrcamento(d.orcamentoId);
    if (!orc) return erro("Orçamento não encontrado para acrescentar lançamentos.", 404);
    const r = await inserirOrcamentoItens(d.orcamentoId, d.rows, { desde: d.desde });
    return ok({ orcamentoId: d.orcamentoId, inserted: r.inserted });
  }

  // start-orcamento — sempre cria um orçamento novo.
  const id = await criarOrcamento(d.nome, d.ano);
  try {
    const r = await inserirOrcamentoItens(id, d.rows);
    await registrarAuditoria({
      usuario: a.u,
      acao: "importar",
      entidade: "orcamento",
      entidadeId: id,
      resumo: `Orçamento "${d.nome}" (${d.ano}) importado — ${d.totalItens} ${d.totalItens === 1 ? "lançamento" : "lançamentos"}`,
      depois: { nome: d.nome, ano: d.ano, itens: d.totalItens },
    });
    return ok({ orcamentoId: id, inserted: r.inserted });
  } catch (e) {
    await excluirOrcamento(id).catch(() => {}); // não deixa orçamento órfão vazio
    throw e;
  }
}
