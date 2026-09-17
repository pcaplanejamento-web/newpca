import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { diffCampos } from "@/lib/auditoria-core";
import { atualizarCatalogo, excluirCatalogo, getCatalogo } from "@/lib/catalogo";
import { patchCatalogoSchema } from "@/lib/catalogo-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Edita (nome/tipos padrão) ou EXCLUI um catálogo — só editor. Excluir apaga os itens. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(patchCatalogoSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getCatalogo(id);
  if (!antes) return erro("Catálogo não encontrado.", 404);
  await atualizarCatalogo(id, p.data);
  const dd = diffCampos(
    antes as Record<string, unknown>,
    p.data as Record<string, unknown>,
    (["nome", "tiposPadrao"] as const).filter((c) => p.data[c] !== undefined),
    { nome: "nome", tiposPadrao: "tipos padrão" },
  );
  await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "catalogo", entidadeId: id, resumo: `Catálogo "${antes.nome}": ${dd.resumo || "editado"}`, antes: dd.antes, depois: dd.depois });
  return ok();
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const alvo = await getCatalogo(id);
  await excluirCatalogo(id);
  await registrarAuditoria({ usuario: a.u, acao: "excluir", entidade: "catalogo", entidadeId: id, resumo: `Catálogo "${alvo?.nome ?? id}" excluído` });
  return ok();
}
