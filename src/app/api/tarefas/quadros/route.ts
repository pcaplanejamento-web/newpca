import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getGrupoAtivoId, gruposDoUsuario } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { criarQuadro, criarQuadroDoModelo, getModelo, modeloQuadroDe } from "@/lib/tarefas";
import { criarQuadroSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/**
 * Cria um QUADRO de tarefas no GRUPO ATIVO do cabeçalho — em branco (nasce com as listas A fazer · Em andamento ·
 * Concluído) ou a partir de um MODELO de quadro de um grupo do usuário (listas + etiquetas).
 */
export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(criarQuadroSchema, req);
  if ("resp" in p) return p.resp;
  const grupoId = await getGrupoAtivoId(a.u);
  if (grupoId == null) return erro("Escolha um grupo no cabeçalho para criar o quadro.", 422);
  const { modeloId, ...d } = p.data;
  let id: number;
  if (modeloId) {
    const m = await getModelo(modeloId);
    if (m?.tipo !== "quadro" || (a.u.role !== "admin" && !(await gruposDoUsuario(a.u.id)).some((g) => g.id === m.grupoId)))
      return erro("Modelo não encontrado.", 404);
    id = await criarQuadroDoModelo(grupoId, d, modeloQuadroDe(m), a.u.id);
  } else id = await criarQuadro(grupoId, d, a.u.id);
  await registrarAuditoria({ usuario: a.u, acao: "criar", entidade: "tarefa_quadro", entidadeId: id, resumo: `Quadro "${p.data.nome}" criado` });
  return ok({ id });
}
