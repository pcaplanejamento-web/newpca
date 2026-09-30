import { exigirUsuario } from "@/lib/api-auth";
import { definirGrupoAtivo, gruposDoUsuario } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { grupoAtivoSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

/** Define o grupo ativo do usuário (cookie). Valida a associação. */
export async function POST(req: Request) {
  const guard = await exigirUsuario();
  if ("erro" in guard) return guard.erro;
  const corpo = await parseCorpo(grupoAtivoSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const { grupoId } = corpo.data;
  const meus = await gruposDoUsuario(guard.u.id);
  if (!meus.some((g) => g.id === grupoId)) return erro("Você não pertence a esse grupo.", 403);
  await definirGrupoAtivo(grupoId);
  return ok();
}
