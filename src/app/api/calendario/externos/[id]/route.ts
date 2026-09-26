import { atualizarExterno, excluirExterno, listarExternos } from "@/lib/agendas-externas";
import { exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { editarExternoSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

async function daPessoa(ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return { resp: a.erro };
  const id = intId((await ctx.params).id);
  const ag = id ? (await listarExternos(a.u.id)).find((x) => x.id === id) : null;
  if (!ag) return { resp: erro("Agenda não encontrada.", 404) };
  return { u: a.u, ag };
}

/** Renomeia/troca a cor da agenda externa (só a da própria pessoa). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await daPessoa(ctx);
  if ("resp" in r) return r.resp;
  const p = await parseCorpo(editarExternoSchema, req);
  if ("resp" in p) return p.resp;
  await atualizarExterno(r.u.id, r.ag.id, p.data);
  return ok();
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await daPessoa(ctx);
  if ("resp" in r) return r.resp;
  await excluirExterno(r.u.id, r.ag.id);
  await registrarAuditoria({ usuario: r.u, acao: "excluir", entidade: "agenda_externa", entidadeId: r.ag.id, resumo: `Agenda externa "${r.ag.nome}" removida` });
  return ok();
}
