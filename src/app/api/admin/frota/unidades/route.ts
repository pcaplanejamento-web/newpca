import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { gravarVinculosUnidades, listarUnidadesFrota } from "@/lib/frota";
import { unidadesFrotaSchema } from "@/lib/frota-validation";
import { ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Liga as UNIDADES que a Vólus manda às unidades do cadastro (o escopo de cada pessoa) — e leva às transações. */
export async function PUT(req: Request) {
  const a = await exigirAdmin();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(unidadesFrotaSchema, req);
  if ("resp" in p) return p.resp;
  const n = await gravarVinculosUnidades(p.data.unidades);
  if (n) await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "frota", resumo: `Frotas (Vólus): ${n} unidade(s) vinculada(s)` });
  return ok({ unidades: await listarUnidadesFrota(), alterados: n });
}
