import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { num } from "@/lib/format";
import { erro, ok, parseCorpo } from "@/lib/http";
import { getOrcamento, substituirLancamentos } from "@/lib/orcamento";
import { substituirOrcamentoSchema } from "@/lib/orcamento-validation";

export const dynamic = "force-dynamic";

/**
 * REENVIO do CUBO: os lançamentos do orçamento `[id]` são SUBSTITUÍDOS pelos do orçamento temporário `origemId` (que o
 * cliente acabou de gravar em lotes) — num lote atômico; o orçamento mantém id/nome/ano. Só editor; auditoria.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(substituirOrcamentoSchema, req);
  if ("resp" in p) return p.resp;
  if (p.data.origemId === id) return erro("A planilha nova precisa vir de outro envio.", 422);
  const [alvo, origem] = await Promise.all([getOrcamento(id), getOrcamento(p.data.origemId)]);
  if (!alvo) return erro("Orçamento não encontrado.", 404);
  if (!origem) return erro("Envio da planilha nova não encontrado — importe de novo.", 404);

  await substituirLancamentos(id, origem.id);
  await registrarAuditoria({
    usuario: a.u,
    acao: "importar",
    entidade: "orcamento",
    entidadeId: id,
    resumo: `Orçamento "${alvo.nome}" (${alvo.ano}): planilha reenviada — ${num(alvo.totalItens)} → ${num(origem.totalItens)} lançamentos`,
    antes: { lancamentos: alvo.totalItens, valorInicial: alvo.valorInicial },
    depois: { lancamentos: origem.totalItens, valorInicial: origem.valorInicial },
  });
  return ok();
}
