import { exigirAcesso, intId, recusa } from "@/lib/api-auth";
import { criadoPorImportacaoRecente, registrarAuditoria } from "@/lib/auditoria";
import { diffCampos } from "@/lib/auditoria-core";
import { erro, ok, parseCorpo } from "@/lib/http";
import { atualizarOrcamento, excluirOrcamento, getOrcamento } from "@/lib/orcamento";
import { patchOrcamentoSchema } from "@/lib/orcamento-validation";

export const dynamic = "force-dynamic";

/** Edita (nome/ano — Configurar) ou EXCLUI um orçamento (Excluir; apaga os lançamentos). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("orcamento", "configurar");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(patchOrcamentoSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getOrcamento(id);
  if (!antes) return erro("Orçamento não encontrado.", 404);
  await atualizarOrcamento(id, p.data);
  const dd = diffCampos(
    antes as Record<string, unknown>,
    p.data as Record<string, unknown>,
    (["nome", "ano"] as const).filter((c) => p.data[c] !== undefined),
    { nome: "nome", ano: "ano" },
  );
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "orcamento",
    entidadeId: id,
    resumo: `Orçamento "${antes.nome}": ${dd.resumo || "editado"}`,
    antes: dd.antes,
    depois: dd.depois,
  });
  return ok();
}

/** Excluir = Excluir. `?origem=desfazer` = o DESFAZER da importação que falhou no meio (ou o temporário do reenvio):
 * o orçamento que ESTA pessoa CRIOU por importação na última hora sai só com Importar (`criadoPorImportacaoRecente` — um
 * orçamento que já existia, mesmo com a planilha reenviada agora, nunca). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("orcamento", "visualizar");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const desfazer = new URL(req.url).searchParams.get("origem") === "desfazer" && (await criadoPorImportacaoRecente("orcamento", id, a.u.id));
  const negado = recusa(a.acesso, "orcamento", desfazer ? "importar" : "excluir");
  if (negado) return negado;
  const alvo = await getOrcamento(id);
  await excluirOrcamento(id);
  await registrarAuditoria({
    usuario: a.u,
    acao: "excluir",
    entidade: "orcamento",
    entidadeId: id,
    resumo: `Orçamento "${alvo?.nome ?? id}" excluído`,
  });
  return ok();
}
