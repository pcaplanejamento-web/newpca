import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { criarFluxo, listarFluxos } from "@/lib/fluxos";
import { criarFluxoSchema } from "@/lib/fluxos-validation";
import { ok, parseCorpo } from "@/lib/http";
import { listarPreferenciasTabela } from "@/lib/preferencias-tabela";

/** A ORDEM dos cartões de cada pessoa (arrastar e soltar na lista). */
const CHAVE_ORDEM = "automacao:ordem-fluxos";

export const dynamic = "force-dynamic";

/** Os fluxos de automação (estilo N8N). */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const [fluxos, prefs] = await Promise.all([listarFluxos(), listarPreferenciasTabela(g.u.id, CHAVE_ORDEM).catch(() => ({}) as Record<string, unknown>)]);
  const o = (prefs[CHAVE_ORDEM] as { ids?: unknown } | undefined)?.ids;
  return ok({ fluxos, ordem: Array.isArray(o) ? o.filter((x): x is number => Number.isInteger(x)) : [] });
}

export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(criarFluxoSchema, req);
  if ("resp" in p) return p.resp;
  const fluxo = await criarFluxo(p.data, g.u.id);
  await registrarAuditoria({ usuario: g.u, acao: "criar", entidade: "automacao", entidadeId: fluxo.id, origem: "centi", resumo: `Fluxo de automação criado: ${fluxo.nome}` });
  return ok({ fluxo });
}
