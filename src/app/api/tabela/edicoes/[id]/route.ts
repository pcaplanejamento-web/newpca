import { exigirUsuario, intId } from "@/lib/api-auth";
import { atualizarEdicaoTabela, excluirEdicaoTabela, getEdicaoTabela } from "@/lib/edicoes-tabela";
import { erro, ok, parseCorpo } from "@/lib/http";
import { editarEdicaoSchema } from "@/lib/preferencias-validation";

export const dynamic = "force-dynamic";

/** A edição, se o usuário é o DONO (ou o ADM); senão a resposta de erro. */
async function doDono(ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return { erro: a.erro };
  const id = intId((await ctx.params).id);
  if (!id) return { erro: erro("ID inválido.") };
  const e = await getEdicaoTabela(id);
  if (!e) return { erro: erro("Edição não encontrada.", 404) };
  if (e.usuarioId !== a.u.id && a.u.role !== "admin") return { erro: erro("Só quem criou a edição pode alterá-la.", 403) };
  return { id };
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const d = await doDono(ctx);
  if ("erro" in d) return d.erro;
  const p = await parseCorpo(editarEdicaoSchema, req);
  if ("resp" in p) return p.resp;
  await atualizarEdicaoTabela(d.id, p.data);
  return ok();
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const d = await doDono(ctx);
  if ("erro" in d) return d.erro;
  await excluirEdicaoTabela(d.id);
  return ok();
}
