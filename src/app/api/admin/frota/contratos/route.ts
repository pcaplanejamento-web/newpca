import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { gravarContratos, listarContratos } from "@/lib/frota";
import { contratosFrotaSchema } from "@/lib/frota-validation";
import { ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Grava os CONTRATOS da Vólus (o órgão de cada um, o produto, ativo) — o órgão novo vai às transações no mesmo lote. */
export async function PUT(req: Request) {
  const a = await exigirAdmin();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(contratosFrotaSchema, req);
  if ("resp" in p) return p.resp;
  const n = await gravarContratos(p.data.contratos);
  if (n) await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "frota", resumo: `Frotas (Vólus): ${n} contrato(s) alterado(s)` });
  return ok({ contratos: await listarContratos(), alterados: n });
}
