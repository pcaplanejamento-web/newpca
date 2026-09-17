import { exigirAdmin } from "@/lib/api-auth";
import { getMetricasWorker } from "@/lib/cf-analytics";
import { erro, ok } from "@/lib/http";
import { getIntegracoes } from "@/lib/integracoes";
import { monitoramentoAtivo } from "@/lib/integracoes-core";

export const dynamic = "force-dynamic";

/** Métricas de invocação do Worker (Cloudflare GraphQL). Só quando o ADM ativou o monitoramento. */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const integ = await getIntegracoes();
  if (!monitoramentoAtivo(integ)) return erro("Monitoramento não está ativado.", 400);
  const r = await getMetricasWorker();
  return r.disponivel ? ok({ metricas: r.metricas }) : erro(r.motivo, 502);
}
