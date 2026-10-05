// O Worker do sistema = o do OpenNext (gerado no build em `.open-next/worker.js`) + o CRON (`scheduled`): a sincronização
// com o Trello e os e-mails (Resend), cada um no SEU gatilho (invocações separadas — cada uma com o próprio limite de
// consultas) + o canal AO VIVO das notificações (WebSocket → o Durable Object `CaixaNotificacoes` da pessoa). O cron chama
// as rotas internas DIRETO no handler (sem sair para a internet), autenticadas pelo SHA-256 de `INTEGRACOES_CHAVE:cron`.
// @ts-expect-error — gerado no build (fora do typecheck: ver tsconfig "exclude")
import handler from "./.open-next/worker.js";
import { lerCookie, origemDoProprioSite } from "./src/lib/ao-vivo-core";

export { CaixaNotificacoes } from "./src/lib/caixa-notificacoes-do";

type Env = { INTEGRACOES_CHAVE?: string; DB: D1Database; CAIXA_NOTIFICACOES: DurableObjectNamespace };
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

export default {
  async fetch(req: Request, env: Env, ctx: Contexto) {
    if (new URL(req.url).pathname === "/api/notificacoes/ao-vivo") {
      try {
        return await aoVivo(req, env);
      } catch (e) {
        console.error("[ao-vivo] falhou:", e);
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
