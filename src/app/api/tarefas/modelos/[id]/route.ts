import { exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { gruposDoUsuario } from "@/lib/grupos";
import { erro, ok } from "@/lib/http";
import { excluirModelo, getModelo, quadroAcessivel } from "@/lib/tarefas";

export const dynamic = "force-dynamic";

/** Exclui um MODELO — quem o salvou ou um editor, desde que veja o grupo/quadro dele. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const m = id ? await getModelo(id) : null;
  const acessivel =
    !!m &&
    (a.u.role === "admin" ||
      (m.quadroId != null ? !!(await quadroAcessivel(a.u, m.quadroId)) : (await gruposDoUsuario(a.u.id)).some((g) => g.id === m.grupoId)));
  if (!m || !acessivel) return erro("Modelo não encontrado.", 404);
  if (m.criadoPor !== a.u.id && a.u.role !== "admin" && a.u.role !== "gestor") return erro("Só quem salvou o modelo (ou um editor) pode excluí-lo.", 403);
  await excluirModelo(m.id);
  await registrarAuditoria({ usuario: a.u, acao: "excluir", entidade: "tarefa_modelo", entidadeId: m.id, resumo: `Modelo "${m.nome}" excluído` });
  return ok();
}
