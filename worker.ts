// O Worker do sistema = o do OpenNext (gerado no build em `.open-next/worker.js`) + o CRON (`scheduled`): a sincronização
// com o Trello e os e-mails (Resend). O cron chama as rotas internas DIRETO no handler (sem sair para a internet),
// autenticadas pelo SHA-256 de `INTEGRACOES_CHAVE:cron`.
// @ts-expect-error — gerado no build (fora do typecheck: ver tsconfig "exclude")
import handler from "./.open-next/worker.js";

type Env = { INTEGRACOES_CHAVE?: string };
type Contexto = { waitUntil(p: Promise<unknown>): void };

async function sha256(texto: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** As rotas internas chamadas a cada passada do cron. */
const ROTAS_CRON: [string, string][] = [
  ["trello", "/api/integracoes/trello/cron"],
  ["email", "/api/integracoes/email/cron"],
];

export default {
  fetch: handler.fetch,
  async scheduled(_evento: unknown, env: Env, ctx: Contexto) {
    if (!env.INTEGRACOES_CHAVE) return;
    const assinatura = await sha256(`${env.INTEGRACOES_CHAVE}:cron`);
    for (const [rotulo, caminho] of ROTAS_CRON) {
      const req = new Request(`https://cron.interno${caminho}`, { method: "POST", headers: { "x-cron-trello": assinatura } });
      ctx.waitUntil(
        Promise.resolve(handler.fetch(req, env, ctx)).then(
          async (r: Response) => {
            if (!r.ok) console.error(`[${rotulo}] cron:`, r.status, await r.text());
          },
          (e: unknown) => console.error(`[${rotulo}] cron falhou:`, e),
        ),
      );
    }
  },
};
