import { z } from "zod";
import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { expurgarSessoesExpiradas, getArmazenamento } from "@/lib/armazenamento";
import { getMetricasWorker, getUsoOficial, type MonitoramentoArmazenamento } from "@/lib/cf-analytics";
import { ok, parseCorpo } from "@/lib/http";
import { getIntegracoes } from "@/lib/integracoes";
import { monitoramentoAtivo } from "@/lib/integracoes-core";

export const dynamic = "force-dynamic";

/**
 * Snapshot de armazenamento do banco + uso oficial do D1 + o MONITORAMENTO do Worker (quando ligado em Integrações), só
 * ADM. `?fresco=1` (botão Recarregar) ignora o cache de 60 s das métricas.
 */
export async function GET(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const fresco = new URL(req.url).searchParams.get("fresco") === "1";
  const integ = await getIntegracoes({ fresco: true });
  const [dados, oficial, monitoramento] = await Promise.all([
    getArmazenamento(),
    getUsoOficial(),
    monitoramentoAtivo(integ) ? getMetricasWorker(7, { fresco }) : Promise.resolve(null),
  ]);
  return ok({ ...dados, oficial, monitoramento: monitoramento satisfies MonitoramentoArmazenamento });
}

const acaoSchema = z.object({ acao: z.enum(["expurgar_sessoes"]) });

/** Ações de manutenção (só ADM). Hoje: expurgar sessões expiradas. */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(acaoSchema, req);
  if ("resp" in p) return p.resp;
  const r = await expurgarSessoesExpiradas();
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "sessao", resumo: `Higiene: ${r.removidas} sessões expiradas expurgadas`, depois: r });
  return ok(r);
}
