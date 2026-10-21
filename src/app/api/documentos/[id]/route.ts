import { exigirAcesso, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { excluirDocumento, getDocumento, renomearDocumento } from "@/lib/documentos";
import { renomearDocumentoSchema } from "@/lib/documentos-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Renomeia o documento. Manipular em Documentos. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("documentos", "manipular");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(renomearDocumentoSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getDocumento(id);
  if (!antes) return erro("Documento não encontrado.", 404);
  await renomearDocumento(id, p.data.nome);
  await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "documento", entidadeId: id, resumo: `Documento "${antes.nome}" → "${p.data.nome}"` });
  return ok();
}

/** Exclui o documento. Excluir em Documentos. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("documentos", "excluir");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const antes = await getDocumento(id);
  if (!antes) return erro("Documento não encontrado.", 404);
  await excluirDocumento(id);
  await registrarAuditoria({ usuario: a.u, acao: "excluir", entidade: "documento", entidadeId: id, resumo: `Documento "${antes.nome}" excluído` });
  return ok();
}
