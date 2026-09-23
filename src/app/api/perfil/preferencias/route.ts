import { exigirUsuario } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { preferenciasPerfilSchema } from "@/lib/auth-validation";
import { getGrupoAtivoId } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { definirResponsavelPadrao, pessoaDoGrupo } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

/** Preferências do PRÓPRIO usuário: o responsável padrão escolhido automaticamente ao protocolar — só uma
 * pessoa ATIVA do grupo ativo (a mesma regra da célula Responsável da Mesa). */
export async function PATCH(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(preferenciasPerfilSchema, req);
  if ("resp" in p) return p.resp;
  const alvo = p.data.responsavelPadraoId;
  if (alvo != null && !(await pessoaDoGrupo(alvo, await getGrupoAtivoId(a.u)))) return erro("Escolha uma pessoa ativa do seu grupo.", 422);
  await definirResponsavelPadrao(a.u.id, alvo);
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "usuario",
    entidadeId: a.u.id,
    resumo: alvo != null ? "Responsável padrão ao protocolar definido" : "Responsável padrão ao protocolar removido",
  });
  return ok();
}
