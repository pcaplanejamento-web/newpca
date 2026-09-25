import { exigirUsuario } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { criarTarefa, etiquetasDoQuadro, getLista, pessoasValidas, quadroAcessivel } from "@/lib/tarefas";
import { rotuloTicket } from "@/lib/tarefas-core";
import { criarTarefaSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/** Cria uma TAREFA (cartão) na lista — qualquer pessoa do grupo do quadro. Responsáveis = pessoas do grupo. */
export async function POST(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(criarTarefaSchema, req);
  if ("resp" in p) return p.resp;
  const d = p.data;
  const q = await quadroAcessivel(a.u, d.quadroId);
  if (!q) return erro("Quadro não encontrado.", 404);
  const lista = await getLista(d.listaId);
  if (!lista || lista.quadroId !== q.id || lista.arquivada) return erro("Lista inválida.", 422);
  const pessoas = d.pessoas ?? [];
  if (!(await pessoasValidas(q.grupoId, pessoas))) return erro("Só pessoas do grupo do quadro podem ser responsáveis.", 422);
  const nova = await criarTarefa({
    quadroId: q.id,
    listaId: lista.id,
    titulo: d.titulo,
    descricao: d.descricao ?? null,
    prioridade: d.prioridade ?? "media",
    inicio: d.inicio ?? null,
    prazo: d.prazo ?? null,
    concluida: lista.concluida,
    pessoas,
    etiquetas: await etiquetasDoQuadro(q.id, d.etiquetas ?? []),
    criadoPor: a.u.id,
  });
  await registrarAuditoria({
    usuario: a.u,
    acao: "criar",
    entidade: "tarefa",
    entidadeId: nova.id,
    resumo: `Tarefa ${rotuloTicket(nova.ticket)} "${d.titulo}" criada no quadro "${q.nome}"`,
    depois: d,
  });
  return ok(nova);
}
