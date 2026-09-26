import { agendaOcupada, agendamentosDoEmail, paginaPublica, tarefaDaPagina } from "@/lib/agendamento";
import { fimDoHorario, horarioLivre } from "@/lib/agendamento-core";
import { registrarAuditoria } from "@/lib/auditoria";
import { linkEvento } from "@/lib/calendario-core";
import { erro, ok, parseCorpo } from "@/lib/http";
import { turnstileConfigurado } from "@/lib/integracoes-core";
import { getIntegracoes } from "@/lib/integracoes";
import { notificar } from "@/lib/notificacoes";
import { criarEvento } from "@/lib/tarefas";
import { somarDias } from "@/lib/tarefas-core";
import { agendarSchema } from "@/lib/tarefas-validation";
import { verificarTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

/** O "agora" de Brasília (UTC−3) — "AAAA-MM-DDTHH:MM". */
const agoraBrasilia = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 16);

/**
 * AGENDAMENTO PÚBLICO (sem login): o horário é conferido de novo (ainda livre, dentro da janela, após a antecedência) e
 * vira um EVENTO na tarefa da página; quem atende é avisado no sino. Captcha quando o ADM ativou; até 3 agendamentos
 * futuros por e-mail em cada página.
 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const pub = await paginaPublica((await ctx.params).slug);
  if (!pub) return erro("Página de agendamento não encontrada.", 404);
  const p = await parseCorpo(agendarSchema, req);
  if ("resp" in p) return p.resp;
  const integ = await getIntegracoes();
  if (turnstileConfigurado(integ)) {
    const cap = await verificarTurnstile(integ, p.data.captchaToken, req.headers.get("cf-connecting-ip"));
    if (!cap.ok) return erro("Confirme que você não é um robô.", 400);
  }
  const { pagina, responsavel } = pub;
  const tarefa = await tarefaDaPagina(pagina.tarefaId);
  if (!tarefa) return erro("Esta página não está recebendo agendamentos.", 404);
  const agora = agoraBrasilia();
  const hoje = agora.slice(0, 10);
  if ((await agendamentosDoEmail(pagina.tarefaId, p.data.email, hoje)) >= 3) return erro("Este e-mail já tem 3 horários marcados nesta página.", 429);
  const { ocupados, feriados } = await agendaOcupada(pagina.usuarioId, hoje, somarDias(hoje, pagina.janelaDias));
  if (!horarioLivre(pagina, ocupados, agora, feriados, p.data.data, p.data.hora)) return erro("Este horário acabou de ser ocupado — escolha outro.", 409);
  const horaFim = fimDoHorario(p.data.hora, pagina.duracaoMin);
  const descricao = [`Agendado por: ${p.data.nome}`, `E-mail: ${p.data.email}`, p.data.observacao ? `Observação: ${p.data.observacao}` : null].filter(Boolean).join("\n");
  const id = await criarEvento(
    pagina.tarefaId,
    {
      titulo: `${pagina.titulo} — ${p.data.nome}`.slice(0, 120),
      data: p.data.data,
      dataFim: null,
      diaInteiro: false,
      horaInicio: p.data.hora,
      horaFim,
      local: null,
      descricao,
      cor: null,
      lembreteMin: 30,
      recorrencia: null,
      linkReuniao: null,
      ocupado: true,
      privado: false,
      convidados: [],
    },
    pagina.usuarioId,
  );
  await notificar([
    {
      usuarioId: pagina.usuarioId,
      tipo: "agendamento",
      titulo: `Novo agendamento: ${p.data.nome}`,
      texto: `${pagina.titulo} · ${p.data.data.slice(8)}/${p.data.data.slice(5, 7)} ${p.data.hora}–${horaFim}`,
      link: linkEvento(p.data.data, `e${id}`),
      tarefaId: tarefa.id,
      quadroId: tarefa.quadroId,
      atorNome: p.data.nome,
    },
  ]);
  await registrarAuditoria({ usuario: null, acao: "criar", entidade: "tarefa", entidadeId: tarefa.id, resumo: `Agendamento público em "${pagina.titulo}": ${p.data.data} ${p.data.hora} (${p.data.nome})` });
  return ok({ data: p.data.data, hora: p.data.hora, horaFim, responsavel });
}
