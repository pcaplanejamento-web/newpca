import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { diffCampos } from "@/lib/auditoria-core";
import { erro, ok, parseCorpo } from "@/lib/http";
import { atualizarOrcamento, excluirOrcamento, getOrcamento } from "@/lib/orcamento";
import { patchOrcamentoSchema } from "@/lib/orcamento-validation";

export const dynamic = "force-dynamic";

/** Edita (nome/ano) ou EXCLUI um orçamento — só editor. Excluir apaga os lançamentos. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
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

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
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
