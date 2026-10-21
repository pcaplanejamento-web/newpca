import { exigirUsuario } from "@/lib/api-auth";
import { lerEscopoTelas, telasComTodas } from "@/lib/escopo-unidades-core";
import { definirReparticaoAtiva, getGrupoAtivo, getReparticaoContexto } from "@/lib/grupos";
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
  // No grupo de "unidade de cadastro" com telas que veem TODAS, vale qualquer unidade dessas telas (a tela de cadastro
  // ignora a escolhida fora da lista dela e mostra a dela).
  const grupo = guard.u.admin ? null : await getGrupoAtivo(guard.u);
  const tela = grupo ? telasComTodas(grupo.modoUnidades, lerEscopoTelas(grupo.escopoTelas))[0] : undefined;
  // O id 0 = a "Geral" das minhas unidades (vale quando a lista do cabeçalho a oferece).
  const [{ lista }, padrao] = await Promise.all([
    getReparticaoContexto(guard.u, guard.u.admin ? undefined : grupo, tela),
    tela ? getReparticaoContexto(guard.u, guard.u.admin ? undefined : grupo) : null,
  ]);
  if (!lista.some((r) => r.id === reparticaoId) && !padrao?.lista.some((r) => r.id === reparticaoId)) return erro("Unidade fora do seu grupo.", 403);
  await definirReparticaoAtiva(reparticaoId);
  return ok();
}
