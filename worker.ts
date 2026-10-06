// O Worker do sistema = o do OpenNext (gerado no build em `.open-next/worker.js`) + o CRON (`scheduled`): a sincronização
// com o Trello e os e-mails (Resend), cada um no SEU gatilho (invocações separadas — cada uma com o próprio limite de
// consultas) + o canal AO VIVO das notificações (WebSocket → o Durable Object `CaixaNotificacoes` da pessoa) + a PRESENÇA
// (quem do grupo está online — WebSocket → o Durable Object `PresencaGrupo` do grupo). O cron chama
// as rotas internas DIRETO no handler (sem sair para a internet), autenticadas pelo SHA-256 de `INTEGRACOES_CHAVE:cron`.
// @ts-expect-error — gerado no build (fora do typecheck: ver tsconfig "exclude")
import handler from "./.open-next/worker.js";
import { lerCookie, origemDoProprioSite } from "./src/lib/ao-vivo-core";
import { lerConfigChat } from "./src/lib/chat-core";
import { CHAVE_PREF_PRESENCA, ficaInvisivel, lerConfigPresenca, lerPrefsPresenca } from "./src/lib/presenca-core";

export { CaixaNotificacoes } from "./src/lib/caixa-notificacoes-do";
export { PresencaGrupo } from "./src/lib/presenca-grupo-do";

type Env = { INTEGRACOES_CHAVE?: string; DB: D1Database; CAIXA_NOTIFICACOES: DurableObjectNamespace; PRESENCA_GRUPO: DurableObjectNamespace };
type Contexto = { waitUntil(p: Promise<unknown>): void };

async function sha256(texto: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A rota interna de cada gatilho do cron (`wrangler.jsonc` → `triggers.crons`). */
const ROTAS_CRON: Record<string, [string, string]> = {
  "*/5 * * * *": ["trello", "/api/integracoes/trello/cron"],
  "2-59/5 * * * *": ["email", "/api/integracoes/email/cron"],
};

/** O canal AO VIVO: só do próprio site, só com a sessão válida de uma pessoa ATIVA — e vai à caixa DELA. */
async function aoVivo(req: Request, env: Env): Promise<Response> {
  if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Esperado WebSocket.", { status: 426 });
  if (!origemDoProprioSite(req.headers.get("Origin"), req.url)) return new Response("Origem recusada.", { status: 403 });
  const token = lerCookie(req.headers.get("Cookie"), "pca_session");
  if (!token) return new Response("Sem sessão.", { status: 401 });
  const linha = await env.DB.prepare(
    "SELECT s.usuario_id AS id FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ? AND s.expira_em > ? AND u.status = 'ativo' LIMIT 1",
  )
    .bind(await sha256(token), new Date().toISOString())
    .first<{ id: number }>();
  if (!linha) return new Response("Sessão inválida.", { status: 401 });
  const caixa = env.CAIXA_NOTIFICACOES.get(env.CAIXA_NOTIFICACOES.idFromName(`u${linha.id}`));
  return caixa.fetch(new Request("https://caixa/ws", { headers: req.headers }));
}

/**
 * A PRESENÇA do grupo: só do próprio site, com a presença LIGADA pelo ADM e a sessão válida de uma pessoa ATIVA que é
 * MEMBRO do grupo pedido — UMA consulta (sessão + grupo + a preferência de invisível + a config). Vai ao objeto DO GRUPO.
 */
async function presenca(req: Request, env: Env): Promise<Response> {
  if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Esperado WebSocket.", { status: 426 });
  if (!origemDoProprioSite(req.headers.get("Origin"), req.url)) return new Response("Origem recusada.", { status: 403 });
  const grupo = Number(new URL(req.url).searchParams.get("grupo"));
  if (!Number.isInteger(grupo) || grupo <= 0) return new Response("Grupo inválido.", { status: 400 });
  const token = lerCookie(req.headers.get("Cookie"), "pca_session");
  if (!token) return new Response("Sem sessão.", { status: 401 });
  const linha = await env.DB.prepare(
    `SELECT s.usuario_id AS id,
       EXISTS (SELECT 1 FROM usuario_grupos g WHERE g.usuario_id = s.usuario_id AND g.grupo_id = ?) AS membro,
       (SELECT p.valor FROM preferencias_tabela p WHERE p.usuario_id = s.usuario_id AND p.chave = ?) AS prefs,
       (SELECT CASE WHEN json_valid(c.dados) THEN json_extract(c.dados, '$.presenca') END FROM configuracoes c WHERE c.id = 1) AS config,
       (SELECT CASE WHEN json_valid(c.dados) THEN json_extract(c.dados, '$.chat') END FROM configuracoes c WHERE c.id = 1) AS chat
     FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token_hash = ? AND s.expira_em > ? AND u.status = 'ativo' LIMIT 1`,
  )
    .bind(grupo, CHAVE_PREF_PRESENCA, await sha256(token), new Date().toISOString())
    .first<{ id: number; membro: number; prefs: string | null; config: string | null; chat: string | null }>();
  if (!linha) return new Response("Sessão inválida.", { status: 401 });
  if (!linha.membro) return new Response("Fora do grupo.", { status: 403 });
  let bruto: unknown = null;
  try {
    bruto = linha.config ? JSON.parse(linha.config) : null;
  } catch {
    /* config inválida = desligada */
  }
  const cfg = lerConfigPresenca(bruto);
  if (!cfg.ativo) return new Response("Presença desligada.", { status: 403 });
  const headers = new Headers(req.headers);
  headers.set("x-presenca-usuario", String(linha.id));
  headers.set("x-presenca-invisivel", ficaInvisivel(cfg, lerPrefsPresenca(linha.prefs)) ? "1" : "0");
  headers.set("x-presenca-ausente", cfg.ausente ? "1" : "0");
  // O CHAT ao vivo (o ADM liga o do grupo e o privado — Configurações → Chat).
  let chat: unknown = null;
  try {
    chat = linha.chat ? JSON.parse(linha.chat) : null;
  } catch {
    /* config inválida = desligado */
  }
  const cfgChat = lerConfigChat(chat);
  headers.set("x-chat-grupo", cfgChat.grupo ? "1" : "0");
  headers.set("x-chat-privado", cfgChat.privado ? "1" : "0");
  // O status gravado (Ocupado, Em reunião…) — a aba o atualiza depois pelo próprio socket.
  const prefs = lerPrefsPresenca(linha.prefs);
  headers.set("x-presenca-status", encodeURIComponent(JSON.stringify({ status: prefs.status, recado: prefs.recado, ate: prefs.ate })));
  const objeto = env.PRESENCA_GRUPO.get(env.PRESENCA_GRUPO.idFromName(`g${grupo}`));
  return objeto.fetch(new Request("https://presenca/ws", { headers }));
}

/** Os canais AO VIVO (WebSocket) atendidos ANTES do Next. */
const CANAIS: Record<string, [string, (req: Request, env: Env) => Promise<Response>]> = {
  "/api/notificacoes/ao-vivo": ["ao-vivo", aoVivo],
  "/api/presenca/ao-vivo": ["presenca", presenca],
};

export default {
  async fetch(req: Request, env: Env, ctx: Contexto) {
    const canal = CANAIS[new URL(req.url).pathname];
    if (canal) {
      try {
        return await canal[1](req, env);
      } catch (e) {
        console.error(`[${canal[0]}] falhou:`, e);
        return new Response("Indisponível.", { status: 503 });
      }
    }
    return handler.fetch(req, env, ctx);
  },
  async scheduled(evento: { cron?: string }, env: Env, ctx: Contexto) {
    if (!env.INTEGRACOES_CHAVE) return;
    const rota = ROTAS_CRON[evento.cron ?? ""];
    if (!rota) return;
    const [rotulo, caminho] = rota;
    const assinatura = await sha256(`${env.INTEGRACOES_CHAVE}:cron`);
    const req = new Request(`https://cron.interno${caminho}`, { method: "POST", headers: { "x-cron-trello": assinatura } });
    ctx.waitUntil(
      Promise.resolve(handler.fetch(req, env, ctx)).then(
        async (r: Response) => {
          if (!r.ok) console.error(`[${rotulo}] cron:`, r.status, await r.text());
        },
        (e: unknown) => console.error(`[${rotulo}] cron falhou:`, e),
      ),
    );
  },
};
