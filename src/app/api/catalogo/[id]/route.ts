import { exigirAcesso, intId, recusa } from "@/lib/api-auth";
import { criadoPorImportacaoRecente, registrarAuditoria } from "@/lib/auditoria";
import { diffCampos } from "@/lib/auditoria-core";
import { atualizarCatalogo, excluirCatalogo, getCatalogo } from "@/lib/catalogo";
import { patchCatalogoSchema } from "@/lib/catalogo-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Edita (nome/tipos padrão) ou EXCLUI um catálogo — só editor. Excluir apaga os itens. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("catalogo", "manipular");
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

/** Excluir = Excluir (os itens compartilhados com outros catálogos ficam). `?origem=desfazer` = o DESFAZER da importação
 * que falhou no meio: o catálogo que ESTA pessoa CRIOU por importação na última hora sai só com Importar
 * (`criadoPorImportacaoRecente` — um catálogo que já existia, mesmo atualizado agora, nunca). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("catalogo", "visualizar");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const desfazer = new URL(req.url).searchParams.get("origem") === "desfazer" && (await criadoPorImportacaoRecente("catalogo", id, a.u.id));
  const negado = recusa(a.acesso, "catalogo", desfazer ? "importar" : "excluir");
  if (negado) return negado;
  const alvo = await getCatalogo(id);
  if (!alvo) return erro("Catálogo não encontrado.", 404);
  await excluirCatalogo(id);
  await registrarAuditoria({
    usuario: a.u,
    acao: "excluir",
    entidade: "catalogo",
    entidadeId: id,
    resumo: `Catálogo "${alvo.nome}" excluído${desfazer ? " (importação desfeita após falha)" : ""}`,
  });
  return ok();
}
