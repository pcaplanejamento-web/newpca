import { exigirUsuario } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { criarModelo, modeloDoQuadro, quadroAcessivel } from "@/lib/tarefas";
import { modeloSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/** SALVA um MODELO de QUADRO (editores — o retrato das listas/etiquetas, para o GRUPO do quadro). */
export async function POST(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(modeloSchema, req);
  if ("resp" in p) return p.resp;
  const d = p.data;
  if (a.u.role !== "admin" && a.u.role !== "gestor") return erro("Só editores salvam modelos de quadro.", 403);
  const q = await quadroAcessivel(a.u, d.quadroId);
  if (!q) return erro("Quadro não encontrado.", 404);
  const id = await criarModelo({ tipo: "quadro", nome: d.nome, grupoId: q.grupoId, quadroId: null, conteudo: await modeloDoQuadro(q), criadoPor: a.u.id });
  await registrarAuditoria({ usuario: a.u, acao: "criar", entidade: "tarefa_modelo", entidadeId: id, resumo: `Modelo de quadro "${d.nome}" salvo` });
  return ok({ id });
}
