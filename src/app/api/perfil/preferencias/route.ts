import { exigirUsuario } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { preferenciasPerfilSchema } from "@/lib/auth-validation";
import { getGrupoAtivoId } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { ROTULO_MESA_RESPONSAVEL } from "@/lib/mesa-filtros";
import { motivoResponsavelPadrao, visaoMesa } from "@/lib/mesa-visao-core";
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
  const gravado = alvo !== undefined ? await responsavelPadraoGravado(a.u.id) : null;
  const padraoMuda = alvo !== undefined && (alvo == null || alvo !== gravado);
  // Os DETALHES do papel: sem ver o Responsável, a Mesa não abre filtrada por ele; e o PADRÃO segue o nível de alterar
  // (não altera = nenhum; só assume para si = só a própria pessoa).
  const vis = visaoMesa(a.u.papel.detalhes, a.u.admin);
  if (mesa !== undefined && !vis.responsavel.ver) return erro("Seu papel não mostra o Responsável na Mesa.", 403);
  if (padraoMuda) {
    const motivo = motivoResponsavelPadrao(vis, a.u.id, gravado, alvo);
    if (motivo) return erro(motivo, 403);
  }
  const grupoAtivo = await getGrupoAtivoId(a.u);
  if (padraoMuda && alvo != null && ((grupoAtivo == null && !a.u.admin) || !(await pessoaDoGrupo(alvo, grupoAtivo))))
    return erro("Escolha uma pessoa ativa do seu grupo.", 422);
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
