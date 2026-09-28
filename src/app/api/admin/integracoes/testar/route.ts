import { z } from "zod";
import { exigirAdmin } from "@/lib/api-auth";
import { getMetricasWorker } from "@/lib/cf-analytics";
import { erro, ok, parseCorpo } from "@/lib/http";
import { getIntegracoes, gravarIntegracoes, lerBlobConfiguracoes } from "@/lib/integracoes";
import { coerceIntegracoes } from "@/lib/integracoes-core";
import { trelloDaConfig } from "@/lib/trello-config";
import { testarTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const testarSchema = z.object({ alvo: z.enum(["turnstile", "monitoramento", "trello"]) });

/** Testa a conexão de uma integração (usa os segredos JÁ configurados); no Trello, confirma e guarda a conta. */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const corpo = await parseCorpo(testarSchema, req);
  if ("resp" in corpo) return corpo.resp;

  if (corpo.data.alvo === "trello") {
    // Confirma a CONTA do token e a guarda (a sincronização ignora o eco das ações dela).
    const t = await trelloDaConfig();
    if ("erro" in t) return erro(t.erro, 422);
    try {
      const eu = await t.cliente.eu();
      const integ = coerceIntegracoes((await lerBlobConfiguracoes()).integracoes);
      if (integ.trello) await gravarIntegracoes({ ...integ, trello: { ...integ.trello, membroId: eu.id, usuario: eu.username, nome: eu.fullName } }, g.u.id);
      return ok({ detalhe: `Conectado como ${eu.fullName} (@${eu.username}).${t.segredo ? "" : " Falta o segredo da aplicação para receber os avisos do Trello."}` });
    } catch (e) {
      return erro((e as Error).message, 422);
    }
  }
  if (corpo.data.alvo === "turnstile") {
    const integ = await getIntegracoes({ fresco: true });
    const r = await testarTurnstile(integ);
    return r.ok ? ok({ detalhe: r.detalhe }) : erro(r.detalhe, 422);
  }
  // Monitoramento: usa os Worker Secrets CF_ANALYTICS_TOKEN/CF_ACCOUNT_ID.
  const r = await getMetricasWorker();
  return r.disponivel ? ok({ detalhe: "Conexão OK — métricas recebidas." }) : erro(r.motivo, 422);
}
