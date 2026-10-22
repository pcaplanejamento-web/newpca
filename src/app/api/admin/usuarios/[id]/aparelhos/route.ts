import { exigirAdmin, intId } from "@/lib/api-auth";
import { getAcessoConta } from "@/lib/acesso-conta";
import { limiteEfetivo, origemDoLimite } from "@/lib/acesso-conta-core";
import { contaAparelhosSchema } from "@/lib/acesso-validation";
import { contaDe, listarAparelhos } from "@/lib/aparelhos";
import { comandoContaAparelhos, comandosRetirarAparelhos } from "@/lib/aparelhos-sql";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { aceitesDe } from "@/lib/termo-uso";
import { eq } from "drizzle-orm";
import { usuarios } from "@/db/schema";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Os aparelhos, o limite e a trava de uma pessoa + os termos que ela aceitou (o banner do usuário). */
export async function GET(_req: Request, ctx: Ctx) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("Usuário inválido.", 400);
  const [p] = await getDb().select({ papelId: usuarios.papelId }).from(usuarios).where(eq(usuarios.id, id)).limit(1);
  if (!p) return erro("Usuário não encontrado.", 404);
  const [lista, conta, cfg, termos] = await Promise.all([listarAparelhos(id), contaDe(id), getAcessoConta(), aceitesDe(id)]);
  return ok({ lista, limiteProprio: conta.limite, trocaAte: conta.trocaAte, limite: limiteEfetivo(cfg, p.papelId, conta.limite), origemLimite: origemDoLimite(cfg, p.papelId, conta.limite), trocaDias: cfg.trocaDias, valem: cfg.modo !== "desligado", padrao: cfg.limite, termos });
}

/** O limite PRÓPRIO da pessoa (null = o do papel/padrão) e/ou liberar a troca. */
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("Usuário inválido.", 400);
  const corpo = await parseCorpo(contaAparelhosSchema, req);
  if ("resp" in corpo) return corpo.resp;
  await comandoContaAparelhos(getDb(), id, corpo.data).run();
  const partes = [corpo.data.limite !== undefined ? `limite de aparelhos: ${corpo.data.limite ?? "o do papel/padrão"}` : "", corpo.data.liberarTroca ? "troca de aparelho liberada" : ""].filter(Boolean);
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "aparelho", entidadeId: id, resumo: `Conta #${id}: ${partes.join("; ")}` });
  return ok();
}

/** Retirar aparelhos da pessoa (encerra as sessões deles; o ADM não inicia trava). */
export async function DELETE(req: Request, ctx: Ctx) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("Usuário inválido.", 400);
  const corpo = await parseCorpo(z.strictObject({ ids: z.array(z.number().int().positive()).min(1).max(20) }), req);
  if ("resp" in corpo) return corpo.resp;
  const db = getDb();
  // O ADM retirando o próprio aparelho desta sessão também não pode (perderia o acesso no meio).
  const manter = id === g.u.id ? g.u.pendencia.aparelhoId : null;
  const [, r] = await db.batch(comandosRetirarAparelhos(db, id, corpo.data.ids, manter));
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "aparelho", entidadeId: id, resumo: `${r.length} aparelho(s) retirado(s) da conta #${id} pelo administrador` });
  return ok({ retirados: r.length });
}
