import { exigirUsuario } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { criarModelo, modeloDaTarefa, modeloDoQuadro, quadroAcessivel, tarefaAcessivel } from "@/lib/tarefas";
import { modeloSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/**
 * SALVA um MODELO: de QUADRO (editores — o retrato das listas/etiquetas, para o GRUPO do quadro) ou de TAREFA (qualquer
 * pessoa do grupo — os campos + o checklist da tarefa, para o quadro dela).
 */
export async function POST(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(modeloSchema, req);
  if ("resp" in p) return p.resp;
  const d = p.data;
  let id: number;
  if (d.tipo === "quadro") {
    if (a.u.role !== "admin" && a.u.role !== "gestor") return erro("Só editores salvam modelos de quadro.", 403);
    const q = await quadroAcessivel(a.u, d.quadroId);
    if (!q) return erro("Quadro não encontrado.", 404);
    id = await criarModelo({ tipo: "quadro", nome: d.nome, grupoId: q.grupoId, quadroId: null, conteudo: await modeloDoQuadro(q), criadoPor: a.u.id });
  } else {
    const r = await tarefaAcessivel(a.u, d.tarefaId);
    if (!r) return erro("Tarefa não encontrada.", 404);
    id = await criarModelo({ tipo: "tarefa", nome: d.nome, grupoId: null, quadroId: r.quadro.id, conteudo: await modeloDaTarefa(r.tarefa, d.prazoDias ?? null), criadoPor: a.u.id });
  }
  await registrarAuditoria({ usuario: a.u, acao: "criar", entidade: "tarefa_modelo", entidadeId: id, resumo: `Modelo de ${d.tipo} "${d.nome}" salvo` });
  return ok({ id });
}
