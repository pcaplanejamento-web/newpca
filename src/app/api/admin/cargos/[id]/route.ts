import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { cargoSchema } from "@/lib/auth-validation";
import { excluirCargo, getCargo, nomeCargoEmUso, renomearCargo } from "@/lib/cargos";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Renomeia o cargo — e o das pessoas que o têm, no mesmo lote. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(cargoSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getCargo(id);
  if (!antes) return erro("Cargo não encontrado.", 404);
  if (await nomeCargoEmUso(p.data.nome, id)) return erro("Já existe um cargo ou função com esse nome.", 409);
  const pessoas = await renomearCargo(antes, p.data.nome);
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "cargo",
    entidadeId: id,
    resumo: `Cargo/função "${antes.nome}" renomeado para "${p.data.nome}"${pessoas ? ` (${pessoas} pessoa(s))` : ""}`,
    antes: { nome: antes.nome },
    depois: { nome: p.data.nome },
  });
  return ok({ pessoas });
}

/** Exclui o cargo da lista — as pessoas que o têm continuam com ele até o ADM trocar. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const antes = await getCargo(id);
  if (!antes) return erro("Cargo não encontrado.", 404);
  await excluirCargo(id);
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "cargo", entidadeId: id, resumo: `Cargo/função "${antes.nome}" excluído`, antes });
  return ok();
}
