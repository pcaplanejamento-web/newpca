import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { trelloFila, trelloQuadros } from "@/db/schema";
import { getDb } from "@/lib/db";
import { processarFila } from "@/lib/trello-processar";
import { lerCamposBoard } from "@/lib/trello-sync-core";
import { exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getIntegracoes } from "@/lib/integracoes";
import { trelloConfigurado } from "@/lib/integracoes-core";
import { erro, ok, parseCorpo } from "@/lib/http";
import { quadroAcessivel } from "@/lib/tarefas";
import { ErroTrello } from "@/lib/trello-api";
import { trelloDaConfig } from "@/lib/trello-config";
import { avancarCriacao, criarBoard, desligarQuadro, estadoTrello, garantirWebhook, ligacaoDoQuadro } from "@/lib/trello-vincular";

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

const acaoSchema = z.object({ acao: z.enum(["criar", "etapa", "desligar", "sincronizar", "pausar", "retomar"]) });

/**
 * `criar` = cria o board ADAPTADO no Trello e liga o quadro; `etapa` = continua a criação (listas, etiquetas, campos,
 * membros, cartões, checklists, comentários — até o orçamento de chamadas); `desligar` = tira a ligação (os dois lados
 * ficam como estão); `sincronizar` = processa agora (reativa os itens com erro); `pausar`/`retomar`.
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
  if (p.data.acao === "pausar" || p.data.acao === "retomar") {
    const lig = await ligacaoDoQuadro(r.q.id);
    if (!lig) return erro("Este quadro não está ligado ao Trello.", 409);
    await getDb().update(trelloQuadros).set({ estado: p.data.acao === "pausar" ? "pausado" : "ativo" }).where(eq(trelloQuadros.quadroId, r.q.id));
    await registrarAuditoria({ usuario: r.u, acao: "editar", entidade: "tarefa_quadro", entidadeId: r.q.id, origem: "trello", resumo: `Sincronização com o Trello ${p.data.acao === "pausar" ? "pausada" : "retomada"}` });
    return ok({ ligacao: await estadoTrello(r.q.id) });
  }
  if ("erro" in t) return erro(t.erro, 422);
  if (p.data.acao === "sincronizar") {
    const lig = await ligacaoDoQuadro(r.q.id);
    if (!lig) return erro("Este quadro não está ligado ao Trello.", 409);
    // Reativa os itens com erro e processa agora (e garante os avisos do Trello).
    await getDb().update(trelloFila).set({ proximaEm: sql`(CURRENT_TIMESTAMP)`, tentativas: 0 }).where(eq(trelloFila.quadroId, r.q.id));
    try {
      await garantirWebhook(t.cliente, lig, lerCamposBoard(lig.campos).origem ?? new URL(req.url).origin, !!t.segredo);
    } catch {
      // segue: a saída funciona sem os avisos
    }
    const res = await processarFila(8, r.q.id);
    return ok({ ...res, ligacao: await estadoTrello(r.q.id) });
  }
  if (r.q.arquivado) return erro("Quadro arquivado — desarquive-o para ligar ao Trello.", 409);
  try {
    let lig = await ligacaoDoQuadro(r.q.id);
    if (p.data.acao === "criar") {
      if (lig) return erro("Este quadro já está ligado ao Trello.", 409);
      lig = await criarBoard(t.cliente, r.q, r.u.id, new URL(req.url).origin);
      await registrarAuditoria({ usuario: r.u, acao: "criar", entidade: "tarefa_quadro", entidadeId: r.q.id, origem: "trello", resumo: `Quadro "${r.q.nome}" criado no Trello` });
    }
    if (!lig) return erro("Este quadro não está ligado ao Trello.", 409);
    const origem = new URL(req.url).origin;
    const { progresso, restante } = await avancarCriacao(t.cliente, r.q, lig, origem);
    // Pronto: liga os AVISOS do Trello (a entrada) — sem o segredo da aplicação, só a saída funciona.
    let aviso: string | null = null;
    if (!restante) {
      try {
        const atual = await ligacaoDoQuadro(r.q.id);
        if (atual && !(await garantirWebhook(t.cliente, atual, origem, !!t.segredo)))
          aviso = "Sem o segredo da aplicação (Integrações → Trello), as mudanças feitas no Trello não voltam para cá.";
      } catch (e) {
        aviso = `Os avisos do Trello não foram ligados: ${(e as Error).message}`;
      }
    }
    return ok({ progresso, restante, aviso, ligacao: await estadoTrello(r.q.id) });
  } catch (e) {
    const msg = (e as Error).message;
    return erro(msg, e instanceof ErroTrello && e.transitorio ? 503 : 422);
  }
}
