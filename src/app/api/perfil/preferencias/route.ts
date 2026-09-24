import { exigirUsuario } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { preferenciasPerfilSchema } from "@/lib/auth-validation";
import { getGrupoAtivoId } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { ROTULO_MESA_RESPONSAVEL } from "@/lib/mesa-filtros";
import { definirMesaResponsavel, definirResponsavelPadrao, pessoaDoGrupo, responsavelPadraoGravado } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

/** Preferências do PRÓPRIO usuário: o responsável padrão escolhido automaticamente ao protocolar — só uma
 * pessoa ATIVA do grupo ativo (a mesma regra da célula Responsável da Mesa) — e o responsável com que a MESA abre. */
export async function PATCH(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(preferenciasPerfilSchema, req);
  if ("resp" in p) return p.resp;
  const { mesaResponsavel: mesa, responsavelPadraoId: alvo } = p.data;
  // Valida TUDO antes de gravar qualquer coisa (nada salvo pela metade). Salvar de novo o MESMO padrão (hoje fora do
  // grupo) não é uma escolha nova — nada muda.
  const padraoMuda = alvo !== undefined && (alvo == null || alvo !== (await responsavelPadraoGravado(a.u.id)));
  if (padraoMuda && alvo != null && !(await pessoaDoGrupo(alvo, await getGrupoAtivoId(a.u)))) return erro("Escolha uma pessoa ativa do seu grupo.", 422);
  if (mesa !== undefined) {
    await definirMesaResponsavel(a.u.id, mesa);
    await registrarAuditoria({
      usuario: a.u,
      acao: "editar",
      entidade: "usuario",
      entidadeId: a.u.id,
      resumo: `Mesa abre com o responsável: ${ROTULO_MESA_RESPONSAVEL[mesa]}`,
    });
  }
  if (!padraoMuda) return ok();
  await definirResponsavelPadrao(a.u.id, alvo ?? null);
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "usuario",
    entidadeId: a.u.id,
    resumo: alvo != null ? "Responsável padrão ao protocolar definido" : "Responsável padrão ao protocolar removido",
  });
  return ok();
}
