import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { type EstadoExecucao, podeTransitar } from "@/lib/automacao-core";
import { getExecucao, mudarEstadoExecucao } from "@/lib/automacao-plataforma";
import { estadoExecucaoSchema } from "@/lib/automacao-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** A execução com os passos (a tela acompanha ao vivo). */
export async function GET(_req: Request, ctx: Ctx) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  const x = id ? await getExecucao(id) : null;
  if (!x) return erro("Execução não encontrada.", 404);
  return ok(x);
}

/** Pausar / retomar / cancelar / concluir — só pelas transições permitidas. */
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  const p = await parseCorpo(estadoExecucaoSchema, req);
  if ("resp" in p) return p.resp;
  const x = id ? await getExecucao(id) : null;
  if (!id || !x) return erro("Execução não encontrada.", 404);
  const de = x.execucao.estado as EstadoExecucao;
  if (de === p.data.estado) return ok({ estado: de });
  if (!podeTransitar(de, p.data.estado)) return erro(`A execução está “${de}” — não pode ir a “${p.data.estado}”.`, 409);
  await mudarEstadoExecucao(id, p.data.estado);
  if (p.data.estado !== "rodando" || de !== "preparada")
    await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "automacao", entidadeId: id, origem: "centi", resumo: `Execução: ${de} → ${p.data.estado}` });
  return ok({ estado: p.data.estado });
}
