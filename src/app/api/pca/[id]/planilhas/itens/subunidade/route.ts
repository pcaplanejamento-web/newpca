import { exigirAcesso, intId, recusaPca } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { getPcaEspaco } from "@/lib/pca-espaco";
import { comandoSubunidadeItens, consultaItensParaSubunidade } from "@/lib/pca-upload-sql";
import { textoNumeros } from "@/lib/sequencial-pca-core";
import { subunidadeDaPlanilha } from "@/lib/subunidades-core";
import { configDasUnidades } from "@/lib/subunidades";
import { subunidadeItensPlanilhaSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * SUBUNIDADE em massa nos itens da PLANILHA (≤ 100). A planilha não traz centro de custo: a subunidade é ESCOLHIDA entre as
 * da unidade da planilha, nos dois modos. Os itens têm de ser deste PCA, ATIVOS e de UMA unidade; a subunidade, dela (422).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("pca", "importar");
  if ("erro" in a) return a.erro;
  const pcaId = intId((await ctx.params).id);
  if (!pcaId) return erro("ID inválido.");
  const semPca = await recusaPca(pcaId);
  if (semPca) return semPca;
  const pca = await getPcaEspaco(pcaId);
  if (!pca) return erro("PCA não encontrado.", 404);
  const p = await parseCorpo(subunidadeItensPlanilhaSchema, req);
  if ("resp" in p) return p.resp;
  const ids = [...new Set(p.data.ids)];
  const subId = p.data.subunidadeId;

  const db = getDb();
  const lidos = await consultaItensParaSubunidade(db, pcaId, ids);
  if (lidos.length !== ids.length) return erro("Algum item não está nas planilhas deste PCA.", 404);
  if (lidos.some((x) => x.canceladoEm)) return erro("Há itens cancelados no PCA na seleção — reative-os antes.", 409);
  const reps = [...new Set(lidos.map((x) => x.reparticaoId))];
  if (reps.length !== 1 || reps[0] == null) return erro(reps.includes(null) ? "Há itens de planilha sem unidade na seleção." : "A subunidade em massa vale para os itens de UMA unidade.", 422);
  const rep = reps[0];
  const cfg = (await configDasUnidades([rep])).get(rep);
  if (!cfg?.subunidades.length) return erro("A unidade da planilha não tem subunidades cadastradas.", 422);
  if (subId != null && !subunidadeDaPlanilha(cfg, subId)) return erro("Subunidade inválida: escolha uma das subunidades da unidade da planilha.", 422);

  const alterados = await comandoSubunidadeItens(db, pcaId, ids, rep, subId);
  const seqs = alterados.map((r) => r.sequencial ?? 0).sort((x, y) => x - y);
  if (alterados.length) {
    const nome = subId == null ? null : (cfg.subunidades.find((s) => s.id === subId)?.nome ?? null);
    await registrarAuditoria({
      usuario: a.u,
      acao: "editar",
      entidade: "planilha",
      entidadeId: pcaId,
      origem: "massa",
      resumo: `Subunidade ${nome ? `“${nome}”` : "retirada"} em ${alterados.length} item(ns) da planilha no ${pca.nome} — Seq. ${textoNumeros(seqs, 20)}`.slice(0, 500),
      depois: { subunidade: nome, itens: seqs },
    });
  }
  return ok({ alterados: alterados.length, falhas: ids.length - alterados.length });
}
