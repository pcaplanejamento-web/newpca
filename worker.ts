// O Worker do sistema = o do OpenNext (gerado no build em `.open-next/worker.js`) + o CRON (`scheduled`) da sincronização
// com o Trello. O cron chama a rota interna `/api/integracoes/trello/cron` DIRETO no handler (sem sair para a internet),
// autenticada pelo SHA-256 de `INTEGRACOES_CHAVE:cron`.
// @ts-expect-error — gerado no build (fora do typecheck: ver tsconfig "exclude")
import handler from "./.open-next/worker.js";

type Env = { INTEGRACOES_CHAVE?: string };
type Contexto = { waitUntil(p: Promise<unknown>): void };

async function sha256(texto: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  fetch: handler.fetch,
  async scheduled(_evento: unknown, env: Env, ctx: Contexto) {
    if (!env.INTEGRACOES_CHAVE) return;
    const req = new Request("https://cron.interno/api/integracoes/trello/cron", {
      method: "POST",
      headers: { "x-cron-trello": await sha256(`${env.INTEGRACOES_CHAVE}:cron`) },
    });
    ctx.waitUntil(
      Promise.resolve(handler.fetch(req, env, ctx)).then(
        async (r: Response) => {
          if (!r.ok) console.error("[trello] cron:", r.status, await r.text());
        },
        (e: unknown) => console.error("[trello] cron falhou:", e),
      ),
    );
  },
};
