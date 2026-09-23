import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { entradasCatalogo } from "@/lib/catalogo";
import { aplicarPlanoItens, dfdsParaMassa, itensParaMassa } from "@/lib/dfd";
import { MASSA_ITENS_MAX_DFDS, massaItensSchema } from "@/lib/dfd-validation";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { type DiffItemDfd, diffItem } from "@/lib/comparar-protocolo";
import { descreverAcaoItem, type ItemMassa, type PlanoMassaItens, planejarMassaItens } from "@/lib/massa-itens";
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

  // Lê só os ITENS pedidos (com o DFD de cada um) + quantos itens cada DFD tem — não carrega DFDs inteiros.
  const itens = await itensParaMassa(ids);
  const porDfd = new Map<number, ItemMassa[]>();
  for (const { dfdId, ...it } of itens) {
    const arr = porDfd.get(dfdId);
    if (arr) arr.push(it);
    else porDfd.set(dfdId, [it]);
  }
  if (porDfd.size > MASSA_ITENS_MAX_DFDS) return erro(`No máximo ${MASSA_ITENS_MAX_DFDS} DFDs por requisição.`, 422);
  const { lista } = await getReparticaoContexto(a.u);
  const acessivel = (rid: number | null) => rid == null || lista.some((r) => r.id === rid);

  const dfds = await dfdsParaMassa([...porDfd.keys()]);
  // Catálogo só quando a ação depende dele (padronizar / trava da unidade) — só os códigos envolvidos.
  const alvos = new Set(ids);
  const catalogo =
    acao.campo === "catalogo" || acao.campo === "unidade" ? await entradasCatalogo(itens.map((it) => normalizarCodigo(it.codigo))) : new Map();

  let alterados = 0;
  const falhas: { dfd: string; item: number | null; motivo: string }[] = [];
  for (const d of dfds) {
    const sel = porDfd.get(d.id) ?? [];
    if (!acessivel(d.reparticaoId)) {
      for (const it of sel) falhas.push({ dfd: d.numero, item: it.item, motivo: "sem acesso à unidade deste DFD" });
      continue;
    }
    const plano = planejarMassaItens(sel, alvos, acao, catalogo, d.totalItens);
    for (const r of plano.recusas) falhas.push({ dfd: d.numero, item: r.item, motivo: r.motivo });
    const n = plano.atualizar.length + plano.remover.length;
    if (n === 0) continue;
    try {
      await aplicarPlanoItens(d.id, plano);
      alterados += n;
      const itensAlterados = diffItensMassa(sel, plano);
      await registrarAuditoria({
        usuario: a.u,
        acao: acao.campo === "remover" ? "excluir" : "editar",
        entidade: "dfd",
        entidadeId: d.id,
        resumo: `DFD ${d.numero}: ${n} item(ns) ${descreverAcaoItem(acao)} em massa (itens ${itensAlterados.map((x) => x.item ?? "?").join(", ")})`.slice(0, 500),
        protocoloId: d.protocoloId,
        origem: "massa",
        detalhe: { alvo: { numero: d.numero, planejamento: d.planejamento }, itens: itensAlterados },
      });
    } catch (e) {
      falhas.push({ dfd: d.numero, item: null, motivo: e instanceof Error ? e.message : "falha ao gravar" });
    }
  }
  return ok({ alterados, falhas });
}

/** Histórico da massa: cada item alterado (campo a campo, a MESMA régua do reenvio) ou removido. */
function diffItensMassa(sel: ItemMassa[], plano: PlanoMassaItens): DiffItemDfd[] {
  const porId = new Map(sel.map((it) => [it.id, it]));
  const out: DiffItemDfd[] = [];
  for (const { id, patch } of plano.atualizar) {
    const it = porId.get(id);
    if (!it) continue;
    out.push({ tipo: "alterado", item: it.item, codigo: it.codigo, descricao: it.descricao, campos: diffItem(it, { ...it, ...patch }) });
  }
  for (const id of plano.remover) {
    const it = porId.get(id);
    if (it) out.push({ tipo: "removido", item: it.item, codigo: it.codigo, descricao: it.descricao, campos: [] });
  }
  return out;
}
