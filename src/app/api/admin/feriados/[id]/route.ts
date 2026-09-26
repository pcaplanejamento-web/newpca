import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { editarFeriadoSchema } from "@/lib/calendario-validation";
import { atualizarFeriado, excluirFeriado, getFeriado } from "@/lib/feriados";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function alvo(ctx: Ctx) {
  const a = await exigirAdmin();
  if ("erro" in a) return { resp: a.erro };
  const id = intId((await ctx.params).id);
  const f = id ? await getFeriado(id) : null;
  if (!f) return { resp: erro("Feriado não encontrado.", 404) };
  return { u: a.u, f };
}

export async function PATCH(req: Request, ctx: Ctx) {
  const x = await alvo(ctx);
  if ("resp" in x) return x.resp;
  const p = await parseCorpo(editarFeriadoSchema, req);
  if ("resp" in p) return p.resp;
  await atualizarFeriado(x.f.id, p.data);
  await registrarAuditoria({ usuario: x.u, acao: "editar", entidade: "feriado", entidadeId: x.f.id, resumo: `Feriado "${p.data.nome ?? x.f.nome}" alterado`, antes: x.f, depois: { ...x.f, ...p.data } });
  return ok();
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const x = await alvo(ctx);
  if ("resp" in x) return x.resp;
  await excluirFeriado(x.f.id);
  await registrarAuditoria({ usuario: x.u, acao: "excluir", entidade: "feriado", entidadeId: x.f.id, resumo: `Feriado "${x.f.nome}" excluído`, antes: x.f });
  return ok();
}
