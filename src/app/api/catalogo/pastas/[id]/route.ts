import { exigirAcesso, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { atualizarPastaCatalogo, excluirPastaCatalogo, getPastaCatalogo } from "@/lib/catalogo-historico";
import { patchPastaCatalogoSchema } from "@/lib/catalogo-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Edita a PASTA (nome, cor e/ou os catálogos dela — a lista inteira). Manipular no Catálogo. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("catalogo", "manipular");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(patchPastaCatalogoSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getPastaCatalogo(id);
  if (!antes) return erro("Pasta não encontrada.", 404);
  await atualizarPastaCatalogo(id, p.data);
  const mudou = [p.data.nome !== undefined && p.data.nome !== antes.nome ? `nome "${antes.nome}" → "${p.data.nome}"` : "", p.data.cor !== undefined && p.data.cor !== antes.cor ? "cor" : "", p.data.catalogos ? `${p.data.catalogos.length} ${p.data.catalogos.length === 1 ? "catálogo" : "catálogos"}` : ""].filter(Boolean);
  await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "catalogo_pasta", entidadeId: id, resumo: `Pasta "${antes.nome}": ${mudou.join(", ") || "editada"}` });
  return ok();
}

/** Exclui a PASTA — os catálogos dela voltam à grade (nada é apagado). Manipular no Catálogo. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("catalogo", "manipular");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const antes = await getPastaCatalogo(id);
  if (!antes) return erro("Pasta não encontrada.", 404);
  await excluirPastaCatalogo(id);
  await registrarAuditoria({ usuario: a.u, acao: "excluir", entidade: "catalogo_pasta", entidadeId: id, resumo: `Pasta "${antes.nome}" excluída (os catálogos voltaram à grade)` });
  return ok();
}
