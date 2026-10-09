import { exigirAdmin, intId } from "@/lib/api-auth";
import { getExecucao, registrarPassos } from "@/lib/automacao-plataforma";
import { passosSchema } from "@/lib/automacao-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** O resultado dos passos (lote ≤ 50) — os totais são recontados no banco; sem pendentes, a execução se encerra. */
export async function POST(req: Request, ctx: Ctx) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  const p = await parseCorpo(passosSchema, req);
  if ("resp" in p) return p.resp;
  const x = id ? await getExecucao(id) : null;
  if (!id || !x) return erro("Execução não encontrada.", 404);
  if (x.execucao.usuarioId !== g.u.id) return erro("Só quem iniciou a execução registra os passos dela.", 403);
  if (!["rodando", "pausada"].includes(x.execucao.estado)) return erro(`A execução está “${x.execucao.estado}”.`, 409);
  const chaves = new Set(x.passos.map((s) => s.chave));
  if (p.data.passos.some((s) => !chaves.has(s.chave))) return erro("Passo desconhecido nesta execução.", 422);
  return ok({ estado: await registrarPassos(id, p.data.passos) });
}
