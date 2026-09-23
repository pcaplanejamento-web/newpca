import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { acessivelNaLista } from "@/lib/mesa-dados";
import { getPcaEspaco, itensNumeradosDoPca, retirarItensDoPca } from "@/lib/pca-espaco";
import { acaoItensPcaSchema } from "@/lib/pca-espaco-validation";

export const dynamic = "force-dynamic";

/**
 * RETIRAR itens do PCA (≤ 100): o SEQUENCIAL do item no PCA fica INATIVO — nunca reaproveitado — e o item sai do
 * Dashboard/Orçamento. Só itens NUMERADOS e ATIVOS deste PCA, nas unidades acessíveis; o resto vira `falhas`.
 * Auditoria com os números retirados.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const pcaId = intId((await ctx.params).id);
  if (!pcaId) return erro("ID inválido.");
  const pca = await getPcaEspaco(pcaId);
  if (!pca) return erro("PCA não encontrado.", 404);
  const p = await parseCorpo(acaoItensPcaSchema, req);
  if ("resp" in p) return p.resp;
  const ids = [...new Set(p.data.ids)];

  const [{ lista }, numerados] = await Promise.all([getReparticaoContexto(a.u), itensNumeradosDoPca(pca.id, ids)]);
  const acessivel = acessivelNaLista(lista);
  const porItem = new Map(numerados.map((n) => [n.dfdItemId, n]));
  const alvo: typeof numerados = [];
  const falhas: { id: number; motivo: string }[] = [];
  for (const id of ids) {
    const n = porItem.get(id);
    if (!n) falhas.push({ id, motivo: "Item não incorporado a este PCA" });
    else if (!n.ativo) falhas.push({ id, motivo: `Nº ${n.sequencial} já inativo` });
    else if (!acessivel(n.reparticaoId)) falhas.push({ id, motivo: "Sem acesso à unidade do item" });
    else alvo.push(n);
  }
  if (alvo.length) {
    await retirarItensDoPca(
      pca.id,
      alvo.map((n) => n.dfdItemId),
      a.u.id,
    );
    await registrarAuditoria({
      usuario: a.u,
      acao: "editar",
      entidade: "pca",
      entidadeId: pca.id,
      resumo: `${alvo.length} item(ns) retirado(s) do ${pca.nome} — nº ${alvo
        .map((n) => n.sequencial)
        .sort((x, y) => x - y)
        .join(", ")} inativo(s)`.slice(0, 500),
      depois: { retirados: alvo.map((n) => ({ sequencial: n.sequencial, dfd: n.dfdNumero })) },
    });
  }
  return ok({ alterados: alvo.length, falhas });
}
