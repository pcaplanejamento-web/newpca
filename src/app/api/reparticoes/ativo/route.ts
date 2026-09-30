import { exigirUsuario } from "@/lib/api-auth";
import { definirReparticaoAtiva, getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { reparticaoAtivaSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

/** Define a unidade ativa (cookie). Valida contra as do grupo ativo. */
export async function POST(req: Request) {
  const guard = await exigirUsuario();
  if ("erro" in guard) return guard.erro;
  const corpo = await parseCorpo(reparticaoAtivaSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const { reparticaoId } = corpo.data;
  const { lista } = await getReparticaoContexto(guard.u);
  if (!lista.some((r) => r.id === reparticaoId)) return erro("Unidade fora do seu grupo.", 403);
  await definirReparticaoAtiva(reparticaoId);
  return ok();
}
