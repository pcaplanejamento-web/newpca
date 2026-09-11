import { exigirUsuario } from "@/lib/api-auth";
import { definirGrupoAtivo, gruposDoUsuario } from "@/lib/grupos";
import { erro, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Define o grupo ativo do usuário (cookie). Valida a associação. */
export async function POST(req: Request) {
  const guard = await exigirUsuario();
  if ("erro" in guard) return guard.erro;
  const body = (await req.json().catch(() => null)) as { grupoId?: unknown } | null;
  const grupoId = Number(body?.grupoId);
  if (!Number.isInteger(grupoId) || grupoId <= 0) return erro("Grupo inválido.");
  const meus = await gruposDoUsuario(guard.u.id);
  if (!meus.some((g) => g.id === grupoId)) return erro("Você não pertence a esse grupo.", 403);
  await definirGrupoAtivo(grupoId);
  return ok();
}
