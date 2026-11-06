import { avisarAdmsPca } from "@/lib/avisos-mesa";
import { exigirAcesso, intId, recusaPca } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { dfdNasLinhas, escopoMesa } from "@/lib/acesso-mesa";
import { erro, ok, parseCorpo } from "@/lib/http";
import { getPcaEspaco, itensNumeradosDoPca, reativarItensDoPca, retirarItensDoPca } from "@/lib/pca-espaco";
import { MOTIVO_NUMERO } from "@/lib/pca-numeracao-core";
import { acaoItensPcaSchema } from "@/lib/pca-espaco-validation";

export const dynamic = "force-dynamic";

/**
 * CANCELAR (`retirar`) itens de protocolo no PCA (≤ 100): o item NÃO é excluído — o SEQUENCIAL fica INATIVO (nunca
 * reaproveitado) e o item sai do Dashboard/Orçamento/cards/declarações. `reativar` devolve o CANCELADO (só ele — o nº
 * baixado ou inativo pela vigência não volta por aqui). Só itens NUMERADOS deste PCA, nas unidades acessíveis; o resto vira
 * `falhas`. Auditoria com os números.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("pca", "excluir");
  if ("erro" in a) return a.erro;
  const pcaId = intId((await ctx.params).id);
  if (!pcaId) return erro("ID inválido.");
  const semPca = await recusaPca(pcaId);
  if (semPca) return semPca;
  const pca = await getPcaEspaco(pcaId);
  if (!pca) return erro("PCA não encontrado.", 404);
  const p = await parseCorpo(acaoItensPcaSchema, req);
  if ("resp" in p) return p.resp;
  const ids = [...new Set(p.data.ids)];
  const reativar = p.data.acao === "reativar";

  const [esc, numerados] = await Promise.all([escopoMesa(), itensNumeradosDoPca(pca.id, ids)]);
  if (!esc) return erro("Faça login.", 401);
  const { acessivel } = esc;
  const porItem = new Map(numerados.map((n) => [n.dfdItemId, n]));
  const alvo: typeof numerados = [];
  const falhas: { id: number; motivo: string }[] = [];
  for (const id of ids) {
    const n = porItem.get(id);
    // O ESCOPO primeiro (unidade e linhas): fora dele, a MESMA falha genérica — o nº e o estado do item não saem.
    if (!n) falhas.push({ id, motivo: "Item não incorporado a este PCA" });
    else if (!acessivel(n.reparticaoId) || (n.dfdId != null && !dfdNasLinhas(esc, n.dfdId))) falhas.push({ id, motivo: "Sem acesso a este item" });
    else if (reativar ? n.ativo : !n.ativo) falhas.push({ id, motivo: `Nº ${n.sequencial} ${reativar ? "já ativo" : "já inativo"}` });
    else if (reativar && (n.baixado || n.motivo !== MOTIVO_NUMERO.retirado))
      falhas.push({ id, motivo: `Nº ${n.sequencial} inativo por outro motivo (${n.motivo ?? "baixado"}) — não é um cancelamento` });
    else alvo.push(n);
  }
  if (alvo.length) {
    const ids2 = alvo.map((n) => n.dfdItemId);
    if (reativar) await reativarItensDoPca(pca.id, ids2, a.u.id);
    else await retirarItensDoPca(pca.id, ids2, a.u.id);
    const seqs = alvo.map((n) => n.sequencial).sort((x, y) => x - y);
    await registrarAuditoria({
      usuario: a.u,
      acao: "editar",
      entidade: "pca",
      entidadeId: pca.id,
      resumo: `${alvo.length} item(ns) ${reativar ? "REATIVADO(S)" : "CANCELADO(S)"} no ${pca.nome} — Seq. ${seqs.join(", ")}`.slice(0, 500),
      depois: { [reativar ? "reativados" : "cancelados"]: alvo.map((n) => ({ sequencial: n.sequencial, dfd: n.dfdNumero })) },
    });
    await avisarAdmsPca(a.u, pca, `${alvo.length} item(ns) ${reativar ? "reativado(s)" : "cancelado(s)"}`, `Seq. ${seqs.slice(0, 12).join(", ")}`);
  }
  return ok({ alterados: alvo.length, falhas });
}
