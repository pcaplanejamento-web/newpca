import { z } from "zod";
import { exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getIntegracoes } from "@/lib/integracoes";
import { trelloConfigurado } from "@/lib/integracoes-core";
import { erro, ok, parseCorpo } from "@/lib/http";
import { quadroAcessivel } from "@/lib/tarefas";
import { ErroTrello } from "@/lib/trello-api";
import { trelloDaConfig } from "@/lib/trello-config";
import { avancarCriacao, criarBoard, desligarQuadro, estadoTrello, ligacaoDoQuadro } from "@/lib/trello-vincular";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** O quadro, se a pessoa pode LIGÁ-LO ao Trello: editor (ADM/gestor) — no quadro PRIVADO, só o dono. */
async function quadroDoEditor(ctx: Ctx) {
  const a = await exigirUsuario();
  if ("erro" in a) return { resp: a.erro };
  const id = intId((await ctx.params).id);
  const q = id ? await quadroAcessivel(a.u, id) : null;
  if (!q) return { resp: erro("Quadro não encontrado.", 404) };
  const pode = q.privado && q.criadoPor != null ? q.criadoPor === a.u.id : a.u.role !== "membro";
  return { u: a.u, q, pode };
}

/** O estado da ligação com o Trello (e se a integração está pronta). */
export async function GET(_req: Request, ctx: Ctx) {
  const r = await quadroDoEditor(ctx);
  if ("resp" in r) return r.resp;
  return ok({ configurado: trelloConfigurado(await getIntegracoes()), ligacao: await estadoTrello(r.q.id), pode: r.pode });
}

const acaoSchema = z.object({ acao: z.enum(["criar", "etapa", "desligar"]) });

/**
 * `criar` = cria o board ADAPTADO no Trello e liga o quadro; `etapa` = continua a criação (listas, etiquetas, campos,
 * membros, cartões, checklists, comentários — até o orçamento de chamadas); `desligar` = tira a ligação (os dois lados
 * ficam como estão).
 */
export async function POST(req: Request, ctx: Ctx) {
  const r = await quadroDoEditor(ctx);
  if ("resp" in r) return r.resp;
  if (!r.pode) return erro(r.q.privado ? "Só o dono liga o quadro privado ao Trello." : "Só editores ligam o quadro ao Trello.", 403);
  const p = await parseCorpo(acaoSchema, req);
  if ("resp" in p) return p.resp;
  const t = await trelloDaConfig();
  if (p.data.acao === "desligar") {
    await desligarQuadro("erro" in t ? null : t.cliente, r.q.id);
    await registrarAuditoria({ usuario: r.u, acao: "editar", entidade: "tarefa_quadro", entidadeId: r.q.id, origem: "trello", resumo: `Quadro "${r.q.nome}" desligado do Trello` });
    return ok({ ligacao: null });
  }
  if ("erro" in t) return erro(t.erro, 422);
  if (r.q.arquivado) return erro("Quadro arquivado — desarquive-o para ligar ao Trello.", 409);
  try {
    let lig = await ligacaoDoQuadro(r.q.id);
    if (p.data.acao === "criar") {
      if (lig) return erro("Este quadro já está ligado ao Trello.", 409);
      lig = await criarBoard(t.cliente, r.q, r.u.id);
      await registrarAuditoria({ usuario: r.u, acao: "criar", entidade: "tarefa_quadro", entidadeId: r.q.id, origem: "trello", resumo: `Quadro "${r.q.nome}" criado no Trello` });
    }
    if (!lig) return erro("Este quadro não está ligado ao Trello.", 409);
    const origem = new URL(req.url).origin;
    const { progresso, restante } = await avancarCriacao(t.cliente, r.q, lig, origem);
    return ok({ progresso, restante, ligacao: await estadoTrello(r.q.id) });
  } catch (e) {
    const msg = (e as Error).message;
    return erro(msg, e instanceof ErroTrello && e.transitorio ? 503 : 422);
  }
}
