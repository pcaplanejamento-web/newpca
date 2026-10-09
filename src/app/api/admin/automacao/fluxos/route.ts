import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { cicloAoGravar, criarFluxo, listarFluxosDe, listarPublicos, subfluxosProibidos } from "@/lib/fluxos";
import { criarFluxoSchema } from "@/lib/fluxos-validation";
import { erro, ok, parseCorpo } from "@/lib/http";
import { idsAutomacoesMesa, PREF_AUTOMACOES_MESA } from "@/lib/automacao-mesa";
import { listarPreferenciasTabela } from "@/lib/preferencias-tabela";

/** A ORDEM dos cartões de cada pessoa (arrastar e soltar na lista). */
const CHAVE_ORDEM = "automacao:ordem-fluxos";
const MSG_SUBFLUXO = "O fluxo usa um subfluxo privado de outra pessoa (ou que não existe mais).";

export const dynamic = "force-dynamic";

/** O PAINEL da pessoa (os fluxos dela) + os PÚBLICOS de outras pessoas (o painel lateral). */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const [fluxos, publicos, prefs] = await Promise.all([
    listarFluxosDe(g.u.id),
    listarPublicos(g.u.id),
    // As preferências da Automação numa consulta só: a ordem dos cartões e as que vão à Mesa.
    listarPreferenciasTabela(g.u.id, "automacao:").catch(() => ({}) as Record<string, unknown>),
  ]);
  const o = (prefs[CHAVE_ORDEM] as { ids?: unknown } | undefined)?.ids;
  return ok({
    fluxos,
    publicos,
    ordem: Array.isArray(o) ? o.filter((x): x is number => Number.isInteger(x)) : [],
    naMesa: idsAutomacoesMesa(prefs[PREF_AUTOMACOES_MESA]),
  });
}

export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(criarFluxoSchema, req);
  if ("resp" in p) return p.resp;
  if (p.data.grafo) {
    if ((await subfluxosProibidos(p.data.grafo, g.u.id)).length) return erro(MSG_SUBFLUXO, 422);
    const ciclo = await cicloAoGravar(null, p.data.grafo);
    if (ciclo) return erro(ciclo, 409);
  }
  const fluxo = await criarFluxo(p.data, g.u.id);
  await registrarAuditoria({
    usuario: g.u,
    acao: "criar",
    entidade: "automacao",
    entidadeId: fluxo.id,
    origem: "centi",
    resumo: `Fluxo de automação criado: ${fluxo.nome}${fluxo.publico ? " (público)" : ""}`,
  });
  return ok({ fluxo });
}
