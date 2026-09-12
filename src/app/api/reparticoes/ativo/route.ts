import { exigirUsuario } from "@/lib/api-auth";
import { definirReparticaoAtiva, getReparticaoContexto } from "@/lib/grupos";
import { erro, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Define a repartição ativa (cookie). Valida contra as do grupo ativo. */
export async function POST(req: Request) {
  const guard = await exigirUsuario();
  if ("erro" in guard) return guard.erro;
  const body = (await req.json().catch(() => null)) as { reparticaoId?: unknown } | null;
  const reparticaoId = Number(body?.reparticaoId);
  if (!Number.isInteger(reparticaoId) || reparticaoId <= 0) return erro("Repartição inválida.");
  const { lista } = await getReparticaoContexto(guard.u);
  if (!lista.some((r) => r.id === reparticaoId)) return erro("Repartição fora do seu grupo.", 403);
  await definirReparticaoAtiva(reparticaoId);
  return ok();
}
