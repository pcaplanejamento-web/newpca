import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { ROTULO_TIPO_FERIADO } from "@/lib/calendario-core";
import { feriadoSchema } from "@/lib/calendario-validation";
import { criarFeriado, listarFeriados } from "@/lib/feriados";
import { dataBR } from "@/lib/format";
import { ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Os feriados cadastrados (Configurações → Feriados). */
export async function GET() {
  const a = await exigirAdmin();
  if ("erro" in a) return a.erro;
  return ok({ feriados: await listarFeriados() });
}

/** Cadastra um feriado/ponto facultativo (anual = repete todo ano). */
export async function POST(req: Request) {
  const a = await exigirAdmin();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(feriadoSchema, req);
  if ("resp" in p) return p.resp;
  const id = await criarFeriado(p.data);
  await registrarAuditoria({
    usuario: a.u,
    acao: "criar",
    entidade: "feriado",
    entidadeId: id,
    resumo: `Feriado "${p.data.nome}" (${ROTULO_TIPO_FERIADO[p.data.tipo]}) em ${p.data.anual ? dataBR(p.data.data).slice(0, 5) : dataBR(p.data.data)}${p.data.anual ? ", todo ano" : ""}`,
    depois: p.data,
  });
  return ok({ id });
}
