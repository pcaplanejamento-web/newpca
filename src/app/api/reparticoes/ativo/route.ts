import { exigirUsuario } from "@/lib/api-auth";
import { lerEscopoTelas, partesDaChave, telasComTodas } from "@/lib/escopo-unidades-core";
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
  // Com abas que veem TODAS (Grupos → Acesso por aba), vale qualquer unidade delas (as outras abas ignoram a escolhida fora
  // da lista delas e mostram a delas).
  const grupo = guard.u.admin ? null : await getGrupoAtivo(guard.u);
  const chave = grupo ? telasComTodas(lerEscopoTelas(grupo.escopoTelas))[0] : undefined;
  const { tela, aba } = chave ? partesDaChave(chave) : { tela: undefined, aba: undefined };
  // O id 0 = a "Geral" das minhas unidades (vale quando a lista do cabeçalho a oferece).
  const [{ lista }, padrao] = await Promise.all([
    getReparticaoContexto(guard.u, guard.u.admin ? undefined : grupo, tela, aba),
    tela ? getReparticaoContexto(guard.u, guard.u.admin ? undefined : grupo) : null,
  ]);
  if (!lista.some((r) => r.id === reparticaoId) && !padrao?.lista.some((r) => r.id === reparticaoId)) return erro("Unidade fora do seu grupo.", 403);
  await definirReparticaoAtiva(reparticaoId);
  return ok();
}
