import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { entradasCatalogo } from "@/lib/catalogo";
import { aplicarPlanoItens, dfdsComItensMassa, dfdsDosItens } from "@/lib/dfd";
import { MASSA_ITENS_MAX_DFDS, massaItensSchema } from "@/lib/dfd-validation";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { descreverAcaoItem, planejarMassaItens, totaisAposPlano } from "@/lib/massa-itens";
import { normalizarCodigo } from "@/lib/parse-catalogo-comum";

export const dynamic = "force-dynamic";

/**
 * EDIÇÃO EM MASSA de ITENS gravados (lista "Itens" da Mesa): padronizar pelo catálogo, unidade de
 * medida, quantidade, valor unitário ou remover — com as MESMAS travas do item a item (unidade igual ao
 * catálogo travada; o DFD nunca fica sem itens). Por DFD: escopo por unidade, plano puro
 * (`planejarMassaItens`), gravação ATÔMICA (itens + total do DFD) e auditoria. Devolve quantos itens
 * mudaram + as recusas/falhas com o motivo (os demais seguem).
 */
export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(massaItensSchema, req);
  if ("resp" in p) return p.resp;
  const { ids, acao } = p.data;

  const dfdDe = await dfdsDosItens(ids);
  const dfdIds = [...new Set(dfdDe.values())];
  if (dfdIds.length > MASSA_ITENS_MAX_DFDS) return erro(`No máximo ${MASSA_ITENS_MAX_DFDS} DFDs por requisição.`, 422);
  const { lista } = await getReparticaoContexto(a.u);
  const acessivel = (rid: number | null) => rid == null || lista.some((r) => r.id === rid);

  const dfds = await dfdsComItensMassa(dfdIds);
  // Catálogo só quando a ação depende dele (padronizar / trava da unidade) — só os códigos envolvidos.
  const alvos = new Set(ids);
  const catalogo =
    acao.campo === "catalogo" || acao.campo === "unidade"
      ? await entradasCatalogo(dfds.flatMap((d) => d.itens.filter((it) => alvos.has(it.id)).map((it) => normalizarCodigo(it.codigo))))
      : new Map();

  let alterados = 0;
  const falhas: { dfd: string; item: number | null; motivo: string }[] = [];
  for (const d of dfds) {
    if (!acessivel(d.reparticaoId)) {
      for (const it of d.itens.filter((x) => alvos.has(x.id))) falhas.push({ dfd: d.numero, item: it.item, motivo: "sem acesso à unidade deste DFD" });
      continue;
    }
    const plano = planejarMassaItens(d.itens, alvos, acao, catalogo);
    for (const r of plano.recusas) falhas.push({ dfd: d.numero, item: r.item, motivo: r.motivo });
    const n = plano.atualizar.length + plano.remover.length;
    if (n === 0) continue;
    try {
      await aplicarPlanoItens(d.id, plano, totaisAposPlano(d.itens, plano));
      alterados += n;
      const nums = [...plano.atualizar.map((x) => x.id), ...plano.remover].map((id) => d.itens.find((it) => it.id === id)?.item ?? "?");
      await registrarAuditoria({
        usuario: a.u,
        acao: acao.campo === "remover" ? "excluir" : "editar",
        entidade: "dfd",
        entidadeId: d.id,
        resumo: `DFD ${d.numero}: ${n} item(ns) ${descreverAcaoItem(acao)} em massa (itens ${nums.join(", ")})`.slice(0, 500),
      });
    } catch (e) {
      falhas.push({ dfd: d.numero, item: null, motivo: e instanceof Error ? e.message : "falha ao gravar" });
    }
  }
  return ok({ alterados, falhas });
}
