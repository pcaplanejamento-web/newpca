import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { criarFluxo, listarFluxos } from "@/lib/fluxos";
import { criarFluxoSchema } from "@/lib/fluxos-validation";
import { ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Os fluxos de automação (estilo N8N). */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ fluxos: await listarFluxos() });
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
