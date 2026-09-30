import { exigirSessao, intId, recusaNoQuadro } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { gruposDoUsuario } from "@/lib/grupos";
import { erro, ok } from "@/lib/http";
import { excluirModelo, getModelo, quadroAcessivel } from "@/lib/tarefas";

export const dynamic = "force-dynamic";

/** Exclui um MODELO — quem o salvou ou quem configura Tarefas no grupo dele, desde que veja o grupo/quadro dele. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const m = id ? await getModelo(id) : null;
  // O GRUPO do modelo: o dele (de quadro) ou o do quadro dele — que a pessoa tem de ver.
  const quadro = m?.quadroId != null ? await quadroAcessivel(a.u, m.quadroId) : null;
  const grupoId = m ? (m.quadroId != null ? (quadro?.grupoId ?? null) : m.grupoId) : null;
  const acessivel = grupoId != null && (a.u.admin || m?.quadroId != null || (await gruposDoUsuario(a.u.id)).some((g) => g.id === grupoId));
  if (!m || grupoId == null || !acessivel) return erro("Modelo não encontrado.", 404);
  // Quem salvou exclui (com Manipular); os demais, com Configurar Tarefas no grupo do modelo.
  const negado = recusaNoQuadro(a.acesso, { grupoId }, m.criadoPor === a.u.id ? "manipular" : "configurar");
  if (negado) return negado;
  await excluirModelo(m.id);
  await registrarAuditoria({ usuario: a.u, acao: "excluir", entidade: "tarefa_modelo", entidadeId: m.id, resumo: `Modelo "${m.nome}" excluído` });
  return ok();
}
