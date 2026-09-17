import { z } from "zod";
import { exigirAdmin } from "@/lib/api-auth";
import { getMetricasWorker } from "@/lib/cf-analytics";
import { erro, ok, parseCorpo } from "@/lib/http";
import { getIntegracoes } from "@/lib/integracoes";
import { testarTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const testarSchema = z.object({ alvo: z.enum(["turnstile", "monitoramento"]) });

/** Testa a conexão de uma integração Cloudflare (usa os segredos JÁ configurados). */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const corpo = await parseCorpo(testarSchema, req);
  if ("resp" in corpo) return corpo.resp;

  if (corpo.data.alvo === "turnstile") {
    const integ = await getIntegracoes();
    const r = await testarTurnstile(integ);
    return r.ok ? ok({ detalhe: r.detalhe }) : erro(r.detalhe, 422);
  }
  // Monitoramento: usa os Worker Secrets CF_ANALYTICS_TOKEN/CF_ACCOUNT_ID.
  const r = await getMetricasWorker();
  return r.disponivel ? ok({ detalhe: "Conexão OK — métricas recebidas." }) : erro(r.motivo, 422);
}
