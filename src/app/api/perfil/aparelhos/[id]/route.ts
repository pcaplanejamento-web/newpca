import { exigirUsuario, intId } from "@/lib/api-auth";
import { motivoNomeAparelho, nomeAparelhoValido } from "@/lib/acesso-conta-core";
import { renomearAparelhoSchema } from "@/lib/acesso-validation";
import { comandoRenomearAparelho, comandosRetirarAparelhos } from "@/lib/aparelhos-sql";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Renomear um aparelho da PRÓPRIA conta. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirUsuario();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("Aparelho inválido.", 400);
  const corpo = await parseCorpo(renomearAparelhoSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const nome = nomeAparelhoValido(corpo.data.nome);
  if (!nome) return erro(motivoNomeAparelho(corpo.data.nome) ?? "Nome inválido.", 422);
  const r = await comandoRenomearAparelho(getDb(), g.u.id, id, nome);
  if (!r.length) return erro("Aparelho não encontrado.", 404);
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "aparelho", entidadeId: id, resumo: `Aparelho renomeado para "${nome}"` });
  return ok();
}

/** Retirar OUTRO aparelho da própria conta (o desta sessão nunca): libera a vaga, sem trava de troca. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirUsuario();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("Aparelho inválido.", 400);
  if (id === g.u.pendencia.aparelhoId) return erro("Este é o aparelho que você está usando agora — ele não pode ser retirado.", 409);
  const db = getDb();
  const [, r] = await db.batch(comandosRetirarAparelhos(db, g.u.id, [id], g.u.pendencia.aparelhoId));
  if (!r.length) return erro("Aparelho não encontrado.", 404);
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "aparelho", entidadeId: id, resumo: "Aparelho retirado da conta pela própria pessoa (sessões dele encerradas)" });
  return ok();
}
