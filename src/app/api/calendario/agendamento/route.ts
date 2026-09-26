import { contarPaginas, criarPagina, listarPaginas, slugEmUso } from "@/lib/agendamento";
import { MAX_PAGINAS_AGENDAMENTO } from "@/lib/agendamento-core";
import { exigirUsuario } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { tarefaAcessivel } from "@/lib/tarefas";
import { paginaAgendamentoSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/** As PÁGINAS DE AGENDAMENTO da pessoa. */
export async function GET() {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  return ok({ paginas: await listarPaginas(a.u.id) });
}

/** Cria a página: a tarefa (onde os agendamentos viram eventos) tem de ser de um quadro da pessoa; endereço único. */
export async function POST(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(paginaAgendamentoSchema, req);
  if ("resp" in p) return p.resp;
  if (!(await tarefaAcessivel(a.u, p.data.tarefaId))) return erro("Tarefa não encontrada.", 404);
  if ((await contarPaginas(a.u.id)) >= MAX_PAGINAS_AGENDAMENTO) return erro(`Até ${MAX_PAGINAS_AGENDAMENTO} páginas de agendamento por pessoa.`, 409);
  if (await slugEmUso(p.data.slug)) return erro("Este endereço já está em uso — escolha outro.", 409);
  const id = await criarPagina(a.u.id, p.data);
  await registrarAuditoria({ usuario: a.u, acao: "criar", entidade: "pagina_agendamento", entidadeId: id, resumo: `Página de agendamento "${p.data.titulo}" (/agendar/${p.data.slug})` });
  return ok({ id });
}
