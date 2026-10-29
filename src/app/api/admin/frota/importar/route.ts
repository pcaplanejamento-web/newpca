import { exigirAdmin } from "@/lib/api-auth";
import { cursorLendo, getConfigFrota, lerPeriodo } from "@/lib/frota";
import { importarFrotaSchema } from "@/lib/frota-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * LÊ UM PERÍODO da Vólus (contrato × tipo × dias) e grava só o que mudou — a tela divide o ano em pedidos (e de novo quando
 * a resposta volta `dividir`). Cada pedido tem o próprio limite de CPU do Worker.
 */
export async function POST(req: Request) {
  const a = await exigirAdmin();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(importarFrotaSchema, req);
  if ("resp" in p) return p.resp;
  // A automática lendo o MESMO contrato × tipo agora: a manual espera (nunca dois pedidos à Vólus pelo mesmo par).
  if (await cursorLendo(p.data.contrato, p.data.tipo)) return erro("A atualização automática está lendo este contrato agora — a importação tenta de novo em instantes.", 409);
  const r = await lerPeriodo(await getConfigFrota(), { ...p.data, origem: "manual", por: a.u.nome });
  // 504 = a Vólus não respondeu a tempo: a tela divide o período (o mesmo falharia de novo).
  if (r.estado === "erro") return erro(r.erro, r.lento ? 504 : r.transitorio ? 503 : 422);
  return ok({ resultado: r });
}
