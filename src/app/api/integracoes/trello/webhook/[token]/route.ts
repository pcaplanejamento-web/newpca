import { eq } from "drizzle-orm";
import { trelloQuadros } from "@/db/schema";
import { getDb } from "@/lib/db";
import { trelloDaConfig } from "@/lib/trello-config";
import { depoisDaResposta, enfileirar } from "@/lib/trello-fila";
import { alvoDoAviso, assinaturaWebhookValida, hashToken, lerCamposBoard } from "@/lib/trello-sync-core";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/** O Trello confere o endereço com um HEAD ao criar o aviso. */
export function HEAD() {
  return new Response(null, { status: 200 });
}

/**
 * O AVISO do Trello (sem sessão): o token do caminho acha o quadro ligado (o banco guarda só o hash) e a assinatura
 * `X-Trello-Webhook` (HMAC-SHA1 com o segredo da aplicação) prova que veio do Trello. O cartão/lista/etiqueta tocado entra
 * na fila de ENTRADA e o processador roda depois da resposta. As ações da conta institucional são o eco das nossas — fora.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!/^[0-9a-f]{64}$/.test(token)) return new Response(null, { status: 404 });
  const [lig] = await getDb().select().from(trelloQuadros).where(eq(trelloQuadros.webhookTokenHash, await hashToken(token)));
  if (!lig) return new Response(null, { status: 410 }); // o Trello apaga o aviso que responde 410
  const corpo = await req.text();
  const t = await trelloDaConfig();
  if ("erro" in t || !t.segredo) return new Response(null, { status: 200 });
  const campos = lerCamposBoard(lig.campos);
  const url = `${campos.origem ?? new URL(req.url).origin}/api/integracoes/trello/webhook/${token}`;
  if (!(await assinaturaWebhookValida(t.segredo, corpo, url, req.headers.get("x-trello-webhook")))) return new Response(null, { status: 401 });
  let acao: unknown = null;
  try {
    acao = (JSON.parse(corpo) as { action?: unknown }).action;
  } catch {
    return new Response(null, { status: 200 });
  }
  const alvo = alvoDoAviso(acao as Parameters<typeof alvoDoAviso>[0], t.membroId);
  if (alvo && lig.estado !== "pausado") {
    await enfileirar(lig.quadroId, "entrada", alvo.tipo, alvo.alvo);
    depoisDaResposta(import("@/lib/trello-processar").then((m) => m.processarFila(4, lig.quadroId)));
  }
  return new Response(null, { status: 200 });
}
