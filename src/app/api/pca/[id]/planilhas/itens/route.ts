import { exigirAcesso, intId, recusaPca } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { avisarAdmsPca } from "@/lib/avisos-mesa";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { getPcaEspaco } from "@/lib/pca-espaco";
import { comandoCancelarItens, comandoTotaisUnidades } from "@/lib/pca-upload-sql";
import { textoNumeros } from "@/lib/sequencial-pca-core";
import { situacaoItensPlanilhaSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * CANCELA ou REATIVA itens da PLANILHA no PCA (≤ 100). Cancelar NÃO exclui: o item e o sequencial ficam inativos e saem dos
 * números do PCA (Dashboard, Orçamento, cards, declarações); reativar devolve. Só os itens deste PCA que mudam de estado;
 * os totais das planilhas no MESMO lote. A mesma ação do item de protocolo ("Cancelar no PCA" = Excluir no PCA).
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
  const p = await parseCorpo(situacaoItensPlanilhaSchema, req);
  if ("resp" in p) return p.resp;
  const ids = [...new Set(p.data.ids)];
  const cancelar = p.data.acao === "cancelar";

  const db = getDb();
  const [alterados] = await db.batch([comandoCancelarItens(db, pcaId, ids, cancelar, { id: a.u.id, nome: a.u.nome }), comandoTotaisUnidades(db, pcaId)]);
  const seqs = alterados.map((r) => r.sequencial ?? 0).sort((x, y) => x - y);
  const falhas = ids.length - alterados.length;
  if (alterados.length) {
    await registrarAuditoria({
      usuario: a.u,
      acao: "editar",
      entidade: "planilha",
      entidadeId: pcaId,
      resumo: `${alterados.length} item(ns) da planilha ${cancelar ? "CANCELADO(S)" : "REATIVADO(S)"} no ${pca.nome} — Seq. ${textoNumeros(seqs, 20)}`.slice(0, 500),
      depois: { [cancelar ? "cancelados" : "reativados"]: seqs },
    });
    await avisarAdmsPca(a.u, pca, `${alterados.length} item(ns) ${cancelar ? "cancelado(s)" : "reativado(s)"}`, `Seq. ${textoNumeros(seqs, 12)}`, "importacao");
  }
  return ok({ alterados: alterados.length, falhas });
}
