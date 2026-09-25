import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getGrupoAtivoId } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { criarQuadro } from "@/lib/tarefas";
import { quadroSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/** Cria um QUADRO de tarefas no GRUPO ATIVO do cabeçalho (nasce com as listas A fazer · Em andamento · Concluído). */
export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(quadroSchema, req);
  if ("resp" in p) return p.resp;
  const grupoId = await getGrupoAtivoId(a.u);
  if (grupoId == null) return erro("Escolha um grupo no cabeçalho para criar o quadro.", 422);
  const id = await criarQuadro(grupoId, p.data, a.u.id);
  await registrarAuditoria({ usuario: a.u, acao: "criar", entidade: "tarefa_quadro", entidadeId: id, resumo: `Quadro "${p.data.nome}" criado` });
  return ok({ id });
}
