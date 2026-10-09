import { exigirAcesso, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { num } from "@/lib/format";
import { erro, ok, parseCorpo } from "@/lib/http";
import { getOrcamento, getOrcamentoItens, listarOrcamentos, substituirLancamentos } from "@/lib/orcamento";
import { adaptarVisao, resumoVisao } from "@/lib/orcamento-visao";
import { substituirOrcamentoSchema } from "@/lib/orcamento-validation";
import { atualizarVisaoOrcamento, listarVisoesOrcamento } from "@/lib/pca-espaco";

export const dynamic = "force-dynamic";

/**
 * REENVIO do CUBO: os lançamentos do orçamento `[id]` são SUBSTITUÍDOS pelos do orçamento temporário `origemId` (que o
 * cliente acabou de gravar em lotes) — num lote atômico que também exclui os demais orçamentos do MESMO ano (nada
 * residual); o orçamento mantém id/nome/ano. Depois, as VISÕES se adaptam aos textos novos (`adaptarVisao`: só
 * acrescentam o equivalente — nunca tiram). Importar no Orçamento; auditoria.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("orcamento", "importar");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(substituirOrcamentoSchema, req);
  if ("resp" in p) return p.resp;
  if (p.data.origemId === id) return erro("A planilha nova precisa vir de outro envio.", 422);
  const [alvo, origem] = await Promise.all([getOrcamento(id), getOrcamento(p.data.origemId)]);
  if (!alvo) return erro("Orçamento não encontrado.", 404);
  if (!origem) return erro("Envio da planilha nova não encontrado — importe de novo.", 404);

  const duplicatas = (await listarOrcamentos(alvo.ano)).filter((o) => o.id !== id && o.id !== origem.id);
  await substituirLancamentos(id, origem.id);
  await registrarAuditoria({
    usuario: a.u,
    acao: "importar",
    entidade: "orcamento",
    entidadeId: id,
    resumo:
      `Orçamento "${alvo.nome}" (${alvo.ano}): planilha reenviada — ${num(alvo.totalItens)} → ${num(origem.totalItens)} lançamentos` +
      (duplicatas.length ? `; ${num(duplicatas.length)} outro(s) orçamento(s) de ${alvo.ano} excluído(s): ${duplicatas.map((o) => o.nome).join("; ")}` : ""),
    antes: { lancamentos: alvo.totalItens, valorInicial: alvo.valorInicial },
    depois: { lancamentos: origem.totalItens, valorInicial: origem.valorInicial },
  });

  // As visões acompanham os dados novos (um valor renomeado/recodificado ganha o equivalente).
  const [itens, visoes] = await Promise.all([getOrcamentoItens(id), listarVisoesOrcamento()]);
  let adaptadas = 0;
  for (const v of visoes) {
    const r = adaptarVisao(v.filtros, itens);
    if (!r.trocas.length) continue;
    await atualizarVisaoOrcamento(v.id, v.nome, r.filtros);
    adaptadas += 1;
    await registrarAuditoria({
      usuario: a.u,
      acao: "editar",
      entidade: "orcamento_visao",
      entidadeId: v.id,
      resumo: `Visão "${v.nome}" adaptada ao QDD novo de ${alvo.ano} (${resumoVisao(r.filtros)}): ${r.trocas.map((t) => `${t.rotulo} "${t.de}" → "${t.para}"`).join("; ")}`,
    });
  }
  return ok({ excluidos: duplicatas.length, visoesAdaptadas: adaptadas });
}
