import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { diffCampos } from "@/lib/auditoria-core";
import { excluirPca } from "@/lib/dfd";
import { erro, ok, parseCorpo } from "@/lib/http";
import { atualizarPcaEspaco, getPcaEspaco, getVisaoOrcamento, pcaTemDados } from "@/lib/pca-espaco";
import { editarPcaEspacoSchema } from "@/lib/pca-espaco-validation";

export const dynamic = "force-dynamic";

/**
 * Configuração do PCA (aba Configuração): nome/ano, FONTE (travada quando já há dados), STATUS
 * (Preview/Publicado — publicado aparece na tela inicial), CAPA do card e a VISÃO do orçamento.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(editarPcaEspacoSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getPcaEspaco(id);
  if (!antes) return erro("PCA não encontrado.", 404);
  const d = p.data;
  if (d.fonte && d.fonte !== antes.fonte) {
    const t = await pcaTemDados(id);
    if (t.planilhas > 0 || t.dfds > 0)
      return erro(`Troca bloqueada: o PCA já tem ${t.planilhas > 0 ? `${t.planilhas} planilha(s)` : `${t.dfds} DFD(s)`}.`, 409);
  }
  if (d.orcamentoVisaoId != null && !(await getVisaoOrcamento(d.orcamentoVisaoId))) return erro("Visão do orçamento não encontrada.", 422);
  await atualizarPcaEspaco(id, d);
  const semCapa = (o: Record<string, unknown>) => ({ ...o, capa: o.capa ? "(imagem)" : null });
  const dd = diffCampos<Record<string, unknown>>(semCapa(antes), semCapa({ ...antes, ...d }), ["nome", "ano", "fonte", "status", "capa", "orcamentoVisaoId"], {
    nome: "nome",
    ano: "ano",
    fonte: "fonte",
    status: "status",
    capa: "capa",
    orcamentoVisaoId: "visão do orçamento",
  });
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "pca",
    entidadeId: id,
    resumo: `PCA "${antes.nome}": ${d.status && d.status !== antes.status ? (d.status === "publicado" ? "PUBLICADO na tela inicial" : "voltou para Preview") : dd.resumo || "editado"}`,
    antes: dd.antes,
    depois: dd.depois,
  });
  return ok();
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  await excluirPca(id);
  await registrarAuditoria({ usuario: a.u, acao: "excluir", entidade: "pca", entidadeId: id, resumo: `PCA #${id} excluído` });
  return ok();
}
