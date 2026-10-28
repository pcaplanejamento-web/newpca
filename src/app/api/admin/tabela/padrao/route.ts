import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getEdicaoTabela, gravarPadraoAdm } from "@/lib/edicoes-tabela";
import { erro, ok, parseCorpo } from "@/lib/http";
import { padraoAdmSchema } from "@/lib/preferencias-validation";

export const dynamic = "force-dynamic";

/**
 * O PADRÃO PARA TODOS de uma tabela (só o ADM): a edição PÚBLICA com que todos abrem a tabela — quem escolheu a própria
 * padrão abre na dela (`edicaoInicial`). `id: null` = volta ao padrão do sistema.
 */
export async function PUT(req: Request) {
  const a = await exigirAdmin();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(padraoAdmSchema, req);
  if ("resp" in p) return p.resp;
  const { chave, id } = p.data;
  if (id != null) {
    const e = await getEdicaoTabela(id);
    if (!e || e.chave !== chave) return erro("Edição não encontrada nesta tabela.", 404);
    if (!e.publico) return erro("Só uma visão PÚBLICA pode ser o padrão para todos — publique-a antes.", 422);
  }
  await gravarPadraoAdm(chave, id, a.u.id);
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "edicao_tabela",
    entidadeId: id,
    resumo: id == null ? `Padrão para todos retirado (${chave})` : `Padrão para todos definido (${chave})`,
  });
  return ok();
}
