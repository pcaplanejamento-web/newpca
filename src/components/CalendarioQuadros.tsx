"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  avisoDiaNaoUtil,
  CHAVE_OPCOES_CALENDARIO,
  carimboIcs,
  type DfdPrevisao,
  eventoComFim,
  eventoMovido,
  eventosPca,
  type FeriadoCadastro,
  feriadosNoIntervalo,
  gerarIcs,
  intervaloCalendario,
  linkEvento,
  type OpcoesCalendario,
} from "@/lib/calendario-core";
import { dataBR } from "@/lib/format";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { Pessoa } from "@/lib/pessoa";
import { predicadoBusca } from "@/lib/tabela-filtros";
import {
  CHAVE_OCULTOS_CALENDARIO,
  dadosDoEventoGravado,
  diasEntre,
  type EtiquetaTarefa,
  type EventoCalendario,
  type EventoTarefa,
  eventosDoCalendario,
  eventoVisivel,
  FILTRO_TAREFAS_PADRAO,
  type FiltroTarefas,
  filtrarTarefas,
  horaDeMinutos,
  horaValida,
  minutosDe,
  type OcultosCalendario,
  reagendar,
  rotuloTicket,
  somarDias,
  type TarefaCalendario,
  TIPOS_EVENTO,
  type TipoEvento,
  textoMes,
} from "@/lib/tarefas-core";
import type { ContextoTarefa } from "@/lib/tarefas-dados";
import { AssinaturaCalendario } from "./AssinaturaCalendario";
import { GerirAgendasExternas, useAgendasExternas } from "./AgendasExternas";
import { BarraCalendario, type ConjuntoExterno, type ConjuntoPca, type GrupoConjuntos } from "./BarraCalendario";
import { BuscaCalendario, type ResultadoBusca } from "./BuscaCalendario";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CalendarioTarefas, type SlotCriar } from "./CalendarioTarefas";
import { useConfirmacao } from "./Confirmacao";
import { EventoBanner } from "./EventoBanner";
import { dadosDoEvento, EditorEvento, problemasEvento, type RascunhoEvento, rascunhoEvento } from "./EventosTarefa";
import { SelectField, TextField } from "./Field";
import { ChipsFiltrosTarefas, FiltrosTarefas } from "./FiltrosTarefas";
import { IconClock, IconKanban, IconUsers } from "./icons";
import { SeletorPessoas } from "./SeletorPessoas";
import { JanelaFlutuante } from "./JanelaFlutuante";
import { Modal } from "./Modal";
import { Segmented } from "./Segmented";
import { SeletorBusca } from "./SeletorBusca";
import { TarefaDetalhe } from "./TarefaDetalhe";
import { toast } from "./Toast";

/** O que o módulo Calendário recebe do servidor (`carregarCalendario`). */
export type DadosCalendarioQuadros = {
  tarefas: (TarefaCalendario & { quadroId: number })[];
  eventos: EventoTarefa[];
  contadores: { atrasadas: number; hoje: number; naSemana: number; semPrazo: number };
  mes: { ano: number; mes: number };
  /** O ano inteiro foi carregado (a vista Ano). */
  anual: boolean;
  hoje: string;
  etiquetas: (EtiquetaTarefa & { quadroId: number })[];
  /** As pessoas (nomes e fotos): as do grupo ativo + as das tarefas e convites. */
  pessoas: Pessoa[];
  /** Os ids das pessoas do GRUPO ativo (quem pode ser convidado; "pesquisar pessoas"). */
  membros: number[];
  abertas: { id: number; quadroId: number; ticket: number; titulo: string; prazo: string | null }[];
  /** As listas ativas dos quadros (concluir/reabrir e criar tarefa pelo calendário). */
  listas: { id: number; nome: string; concluida: boolean; quadroId: number }[];
  ocultos: OcultosCalendario;
  opcoes: OpcoesCalendario;
  feriados: FeriadoCadastro[];
  /** O cronograma do PCA (quem vê o módulo PCA; senão, vazio). */
  pca: { pcas: { id: number; nome: string; ano: number }[]; dfds: DfdPrevisao[] };
  /** A pessoa tem link de assinatura ativo. */
  assinatura: boolean;
  /** Alguma carga bateu no teto (a tela avisa). */
  truncado: boolean;
  quadros: { id: number; nome: string; cor: string }[];
};

/** Grava uma preferência do calendário (PUT) — `sair` = a página está sendo fechada (`keepalive`, sem aviso). */
function gravarPreferencia(chave: string, valor: unknown, sair = false) {
  if (sair) {
    fetch("/api/preferencias/tabela", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave, valor }), keepalive: true }).catch(() => {});
    return Promise.resolve();
  }
  return chamar("/api/preferencias/tabela", "PUT", { chave, valor });
}

/**
 * O CONTEXTO do quadro de uma tarefa (o banner da tarefa aberto no Calendário) — lido sob demanda, UMA vez por tarefa;
 * depois de salvar, `atualizarTarefa` relê SÓ o resumo da tarefa (`?contexto=tarefa` — listas/etiquetas/pessoas ficam).
 */
function useContextoTarefa(tarefaId: number | null) {
  const [ctx, setCtx] = useState<ContextoTarefa | null>(null);
  useEffect(() => {
    if (tarefaId == null) return setCtx(null);
    let vivo = true;
    chamar<{ contexto: ContextoTarefa }>(`/api/tarefas/${tarefaId}?contexto=1`)
      .then((j) => vivo && setCtx(j.contexto))
      .catch((e) => vivo && toast.error((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [tarefaId]);
  const atualizarTarefa = useCallback(() => {
    if (tarefaId == null) return;
    chamar<{ tarefa: ContextoTarefa["tarefa"] }>(`/api/tarefas/${tarefaId}?contexto=tarefa`)
      .then((j) => setCtx((c) => (c && c.tarefa.id === j.tarefa.id ? { ...c, tarefa: j.tarefa } : c)))
      .catch(() => {});
  }, [tarefaId]);
  return { ctx: ctx && ctx.tarefa.id === tarefaId ? ctx : null, atualizarTarefa };
}

/** Edição completa de um evento ("Mais opções", Editar, Duplicar) — novo = escolhe a tarefa. */
type Edicao = { eventoId: number | null; tarefaId: string; r: RascunhoEvento };
/** A CRIAÇÃO RÁPIDA (a janela ao lado do dia): Evento (numa tarefa) ou Tarefa (nova, com o prazo no dia). */
type Criacao = {
  slot: SlotCriar;
  tipo: "evento" | "tarefa";
  titulo: string;
  data: string;
  comHora: boolean;
  hora: string;
  horaFim: string;
  tarefaId: string;
  quadroId: number;
  listaId: number | null;
};

/**
 * MÓDULO CALENDÁRIO (`/painel/calendario`, permissão própria `calendario`) — a tela INTEIRA é o calendário (o
 * `CalendarioTarefas`: nada rola na página): na lateral os FILTROS das tarefas (busca, responsável, prazo, prioridade,
 * etiqueta), o mini-mês, os TIPOS + feriados e os CONJUNTOS (cada tarefa, cada quadro e cada PCA — o que fica oculto é a
 * preferência da pessoa). Os eventos: o PERÍODO de cada tarefa, as OCORRÊNCIAS da recorrência (e a prevista), os EVENTOS
 * cadastrados e a PREVISÃO do PCA (quem vê o PCA).
 * - CRIAR (o botão, um dia, um horário ou arrastando na grade) abre a JANELA de criação rápida ao lado, com o
 *   "(Sem título)" já na grade: **Evento** (numa tarefa aberta, com ou sem horário) ou **Tarefa** (nova, no quadro/lista
 *   escolhidos, com o prazo no dia); "Mais opções" leva ao formulário completo (a tarefa nova abre ao lado, criada).
 * - Tocar num evento abre o BANNER DO EVENTO aqui mesmo; "Ver tarefa" abre a tarefa AO LADO.
 * - O CÍRCULO do período conclui/reabre a tarefa (pela lista de concluídas do quadro — automações e recorrência valem).
 * - Arrastar reagenda (evento, período e as TAREFAS SEM PRAZO do painel); a borda muda a duração; mover, redimensionar,
 *   concluir e excluir têm **Desfazer**.
 * - ⚙ Configurações: as opções da pessoa + exportar/assinar `.ics`; `eventoInicial` = o link do lembrete abre o evento.
 */
export function CalendarioQuadros({ dados, usuarioId, eventoInicial }: { dados: DadosCalendarioQuadros; usuarioId: number; eventoInicial?: string }) {
  const router = useRouter();
  const [carregando, iniciar] = useTransition();
  const [filtro, setFiltro] = useState<FiltroTarefas>(FILTRO_TAREFAS_PADRAO);
  const [tarefas, setTarefas] = useState(dados.tarefas);
  const [eventosDb, setEventosDb] = useState(dados.eventos);
  useEffect(() => setTarefas(dados.tarefas), [dados.tarefas]);
  useEffect(() => setEventosDb(dados.eventos), [dados.eventos]);
  const [ocultos, setOcultos] = useState(dados.ocultos);
  const [opcoes, setOpcoes] = useState(dados.opcoes);
  const [aberto, setAberto] = useState<EventoCalendario | null>(null);
  const [verTarefa, setVerTarefa] = useState(false);
  /** Uma tarefa aberta SEM evento (o painel das sem prazo, a tarefa recém-criada por "Mais opções"). */
  const [tarefaSolta, setTarefaSolta] = useState<number | null>(null);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [criacao, setCriacao] = useState<Criacao | null>(null);
  const [salvando, setSalvando] = useState(false);
  /** "PESQUISAR PESSOAS" (como no Google): só os eventos em que alguma delas está (responsável, convidada ou autora). */
  const [pessoasVer, setPessoasVer] = useState<number[]>([]);
  const { confirmar, confirmacao } = useConfirmacao();
  const idTarefa = tarefaSolta ?? (aberto && verTarefa && !aberto.pca ? aberto.tarefaId : null);
  const { ctx, atualizarTarefa } = useContextoTarefa(idTarefa);

  const porQuadro = useMemo(() => new Map(dados.quadros.map((q) => [q.id, q])), [dados.quadros]);
  const membros = useMemo(() => dados.pessoas.filter((p) => dados.membros.includes(p.id)), [dados.pessoas, dados.membros]);
  const responsaveis = useMemo(() => new Map(tarefas.map((t) => [t.id, t.pessoas])), [tarefas]);
  const variosQuadros = dados.quadros.length > 1;
  const etiquetas = useMemo(
    () => dados.etiquetas.map((e) => (variosQuadros ? { ...e, nome: `${e.nome} · ${porQuadro.get(e.quadroId)?.nome ?? ""}` } : e)),
    [dados.etiquetas, porQuadro, variosQuadros],
  );
  const inicioSemana = opcoes.inicioSegunda ? 1 : 0;
  const { de, ate } = useMemo(() => intervaloCalendario(dados.mes, inicioSemana, dados.anual), [dados.mes, inicioSemana, dados.anual]);
  /** Os feriados do período (todos — o aviso do prazo); a grade só os mostra se não estiverem ocultos. */
  const feriadosPeriodo = useMemo(() => feriadosNoIntervalo(dados.feriados, de, ate), [dados.feriados, de, ate]);
  const feriadosVisiveis = ocultos.feriados ? undefined : feriadosPeriodo;
  /** As AGENDAS EXTERNAS (.ics assinados) — carregadas depois da tela, no intervalo à vista. */
  const externas = useAgendasExternas(de, ate);
  const [gerirExternas, setGerirExternas] = useState(false);
  const filtrando =
    filtro.responsavel !== FILTRO_TAREFAS_PADRAO.responsavel ||
    filtro.prazo !== FILTRO_TAREFAS_PADRAO.prazo ||
    filtro.prioridade !== FILTRO_TAREFAS_PADRAO.prioridade ||
    filtro.etiqueta !== FILTRO_TAREFAS_PADRAO.etiqueta;

  // Os eventos do período: as tarefas passam pelos filtros da lateral; a PREVISÃO do PCA só quando nenhum filtro de
  // TAREFA está ligado (responsável/prazo/prioridade/etiqueta não se aplicam a um DFD). A busca vale em todos.
  const todos = useMemo(() => {
    const t = filtrarTarefas(tarefas, { ...filtro, busca: "" }, { usuarioId, hoje: dados.hoje });
    const casa = predicadoBusca(filtro.busca);
    const ev = [
      ...eventosDoCalendario(t, eventosDb, de, ate, dados.hoje),
      ...(filtrando || pessoasVer.length ? [] : [...eventosPca(dados.pca.dfds, de, ate), ...externas.agendas.flatMap((a) => a.eventos)]),
    ];
    const envolve = (e: EventoCalendario) =>
      !e.pca &&
      !e.externo &&
      pessoasVer.some((p) => (responsaveis.get(e.tarefaId) ?? []).includes(p) || e.criadoPor === p || !!e.convidados?.some((c) => c.usuarioId === p));
    return ev.filter(
      (e) =>
        (!pessoasVer.length || envolve(e)) &&
        (!casa || casa([e.titulo, e.tarefaTitulo, e.local ?? "", e.pca ? `DFD ${e.pca.numero} ${e.pca.planejamento ?? ""} ${e.pca.sigla ?? ""}` : e.externo ? "" : `${rotuloTicket(e.ticket)} ${e.ticket}`])),
    );
  }, [tarefas, eventosDb, filtro, filtrando, usuarioId, dados.hoje, dados.pca.dfds, de, ate, pessoasVer, responsaveis, externas.agendas]);
  const visiveis = useMemo(() => todos.filter((e) => eventoVisivel(e, ocultos)), [todos, ocultos]);
  const grupos = useMemo<GrupoConjuntos[]>(() => {
    const m = new Map<number, Map<number, { id: number; ticket: number; titulo: string; eventos: number }>>();
    for (const e of todos) {
      if (e.pca || e.externo) continue;
      const g = m.get(e.quadroId) ?? new Map();
      const t = g.get(e.tarefaId) ?? { id: e.tarefaId, ticket: e.ticket, titulo: e.tarefaTitulo, eventos: 0 };
      t.eventos++;
      g.set(e.tarefaId, t);
      m.set(e.quadroId, g);
    }
    return dados.quadros.filter((q) => m.has(q.id)).map((q) => ({ quadro: q, tarefas: [...(m.get(q.id)?.values() ?? [])].sort((a, b) => a.ticket - b.ticket) }));
  }, [todos, dados.quadros]);
  const pcasConjuntos = useMemo<ConjuntoPca[]>(() => {
    const n = new Map<number, number>();
    for (const e of todos) if (e.pca) n.set(e.pca.pcaId, (n.get(e.pca.pcaId) ?? 0) + 1);
    return dados.pca.pcas.filter((p) => n.has(p.id)).map((p) => ({ id: p.id, nome: p.nome, eventos: n.get(p.id) ?? 0 }));
  }, [todos, dados.pca.pcas]);
  const externosConjuntos = useMemo<ConjuntoExterno[]>(
    () => externas.agendas.map((a) => ({ id: a.id, nome: a.nome, cor: a.cor, eventos: todos.filter((e) => e.externo?.agendaId === a.id).length, erro: a.erro })),
    [externas.agendas, todos],
  );
  const porTipo = useMemo(() => {
    const c = Object.fromEntries(TIPOS_EVENTO.map((t) => [t, 0])) as Record<TipoEvento, number>;
    for (const e of todos) c[e.tipo]++;
    return c;
  }, [todos]);
  const diasComEvento = useMemo(() => {
    const s = new Set<string>();
    for (const e of visiveis) for (let d = e.inicio, i = 0; d <= e.fim && i < 62; d = somarDias(d, 1), i++) s.add(d);
    return s;
  }, [visiveis]);
  const nOcultos = ocultos.tarefas.length + ocultos.quadros.length + ocultos.pcas.length + ocultos.externos.length + ocultos.tipos.length + Number(ocultos.feriados);
  const semPrazo = useMemo(() => dados.abertas.filter((t) => !t.prazo), [dados.abertas]);

  // O que fica OCULTO é a preferência da pessoa (gravada ~0,6 s depois da última mudança — marcar vários não vira vários
  // PUT). Fechar/sair da página com uma gravação pendente GRAVA na hora (`keepalive`) — nada se perde.
  const gravar = useRef<number | undefined>(undefined);
  const pendente = useRef<OcultosCalendario | null>(null);
  const mudarOcultos = (o: OcultosCalendario) => {
    setOcultos(o);
    pendente.current = o;
    window.clearTimeout(gravar.current);
    gravar.current = window.setTimeout(() => {
      pendente.current = null;
      gravarPreferencia(CHAVE_OCULTOS_CALENDARIO, o).catch(() => toast.error("Não foi possível guardar o que fica oculto."));
    }, 600);
  };
  useEffect(() => {
    const sair = () => {
      if (!pendente.current) return;
      window.clearTimeout(gravar.current);
      gravarPreferencia(CHAVE_OCULTOS_CALENDARIO, pendente.current, true);
      pendente.current = null;
    };
    const oculta = () => document.visibilityState === "hidden" && sair();
    window.addEventListener("pagehide", sair);
    document.addEventListener("visibilitychange", oculta);
    return () => {
      window.removeEventListener("pagehide", sair);
      document.removeEventListener("visibilitychange", oculta);
      sair(); // trocar de tela (desmontar) também grava
    };
  }, []);

  const urlMes = (m: { ano: number; mes: number }, anual = dados.anual) => `/painel/calendario?mes=${textoMes(m.ano, m.mes)}${anual ? "&ano=1" : ""}`;
  const irMes = (m: { ano: number; mes: number }) => iniciar(() => router.push(urlMes(m), { scroll: false }));
  const irAno = (anual: boolean) => {
    if (anual !== dados.anual) iniciar(() => router.push(urlMes(dados.mes, anual), { scroll: false }));
  };
  const atualizar = () => iniciar(() => router.refresh());

  /** As OPÇÕES da pessoa: gravam na hora; a semana começando noutro dia muda a grade — o servidor recarrega. */
  const mudarOpcoes = (o: OpcoesCalendario) => {
    const mudouInicio = o.inicioSegunda !== opcoes.inicioSegunda;
    setOpcoes(o);
    gravarPreferencia(CHAVE_OPCOES_CALENDARIO, o)
      .then(() => mudouInicio && atualizar())
      .catch(() => toast.error("Não foi possível guardar as opções do calendário."));
  };

  /** Mostra "feito" com **Desfazer** (`reverter` = a gravação que volta ao estado anterior). */
  const comDesfazer = (msg: string, reverter: () => Promise<unknown>) =>
    toast.desfazer(msg, () => {
      reverter()
        .then(() => {
          toast.success("Desfeito.");
          atualizar();
        })
        .catch((e) => toast.error((e as Error).message));
    });

  /** ARRASTAR: o período muda o prazo (o início anda junto; a tarefa SEM PRAZO ganha o prazo); o evento muda a data (e a
   * hora, na grade — a duração fica). */
  const mover = async (e: EventoCalendario, dia: string, hora: string | null) => {
    if (e.tipo === "periodo") {
      const t = tarefas.find((x) => x.id === e.tarefaId);
      const antes = tarefas;
      const original = t ? { inicio: t.inicio, prazo: t.prazo } : { prazo: null };
      const novo = t ? reagendar(t, dia) : { prazo: dia };
      if (t) setTarefas(antes.map((x) => (x.id === t.id ? { ...x, ...novo } : x)));
      try {
        await chamar(`/api/tarefas/${e.tarefaId}`, "PATCH", novo);
        const aviso = avisoDiaNaoUtil(dia, feriadosPeriodo);
        comDesfazer(`${rotuloTicket(e.ticket)} com prazo em ${dataBR(dia)}${aviso ? ` — ${aviso}` : ""}.`, () => chamar(`/api/tarefas/${e.tarefaId}`, "PATCH", original));
        atualizar();
      } catch (err) {
        setTarefas(antes);
        toast.error((err as Error).message);
      }
      return;
    }
    const ev = eventosDb.find((x) => x.id === e.eventoId);
    if (!ev) return;
    // Uma OCORRÊNCIA da série move a série inteira pela mesma distância.
    const d = eventoMovido(ev, somarDias(ev.data, diasEntre(e.inicio, dia)), hora);
    const antes = eventosDb;
    setEventosDb(antes.map((x) => (x.id === ev.id ? { ...x, ...d, convidados: x.convidados } : x)));
    try {
      await chamar(`/api/tarefas/eventos/${ev.id}`, "PATCH", d);
      comDesfazer(`"${ev.titulo}"${ev.recorrencia ? " (a série)" : ""} movido para ${dataBR(dia)}${d.horaInicio && !d.diaInteiro ? ` às ${d.horaInicio}` : ""}.`, () =>
        chamar(`/api/tarefas/eventos/${ev.id}`, "PATCH", eventoMovido(ev, ev.data, null)),
      );
      atualizar();
    } catch (err) {
      setEventosDb(antes);
      toast.error((err as Error).message);
    }
  };

  /** REDIMENSIONAR: o fim do evento com hora vai para `horaFim` (a borda de baixo arrastada). */
  const redimensionar = async (e: EventoCalendario, horaFim: string) => {
    const ev = eventosDb.find((x) => x.id === e.eventoId);
    if (!ev || ev.horaFim === horaFim) return;
    const antes = eventosDb;
    setEventosDb(antes.map((x) => (x.id === ev.id ? { ...x, horaFim } : x)));
    try {
      await chamar(`/api/tarefas/eventos/${ev.id}`, "PATCH", eventoComFim(ev, horaFim));
      comDesfazer(`"${ev.titulo}" agora vai até ${horaFim}.`, () => chamar(`/api/tarefas/eventos/${ev.id}`, "PATCH", eventoMovido(ev, ev.data, null)));
      atualizar();
    } catch (err) {
      setEventosDb(antes);
      toast.error((err as Error).message);
    }
  };

  /** O CÍRCULO do período: conclui (leva à 1ª lista de concluídas do quadro) ou reabre (1ª lista aberta). */
  const concluir = async (e: EventoCalendario) => {
    const t = tarefas.find((x) => x.id === e.tarefaId);
    if (!t) return;
    const listas = dados.listas.filter((l) => l.quadroId === t.quadroId);
    const destino = e.concluida ? listas.find((l) => !l.concluida) : listas.find((l) => l.concluida);
    if (!destino) {
      toast.info(e.concluida ? "O quadro não tem lista aberta para reabrir a tarefa." : "O quadro não tem lista de concluídas — marque uma na Configuração do quadro.");
      return;
    }
    const antes = tarefas;
    setTarefas(antes.map((x) => (x.id === t.id ? { ...x, concluidaEm: e.concluida ? null : dados.hoje, listaId: destino.id } : x)));
    try {
      await chamar(`/api/tarefas/${t.id}`, "PATCH", { listaId: destino.id });
      comDesfazer(`${rotuloTicket(t.ticket)} ${e.concluida ? "reaberta" : "concluída"}.`, () => chamar(`/api/tarefas/${t.id}`, "PATCH", { listaId: t.listaId }));
      atualizar();
    } catch (err) {
      setTarefas(antes);
      toast.error((err as Error).message);
    }
  };

  /** A RESPOSTA ao convite (Vai · Talvez · Não vai) — otimista. */
  const responder = async (e: EventoCalendario, resposta: "sim" | "nao" | "talvez") => {
    if (!e.eventoId) return;
    const antes = eventosDb;
    const troca = (lista: typeof eventosDb) =>
      lista.map((x) => (x.id === e.eventoId ? { ...x, convidados: x.convidados.map((c) => (c.usuarioId === usuarioId ? { ...c, resposta } : c)) } : x));
    setEventosDb(troca);
    setAberto((a) => (a && a.eventoId === e.eventoId ? { ...a, convidados: a.convidados?.map((c) => (c.usuarioId === usuarioId ? { ...c, resposta } : c)) } : a));
    try {
      await chamar(`/api/tarefas/eventos/${e.eventoId}/resposta`, "POST", { resposta });
      toast.success("Resposta enviada.");
    } catch (err) {
      setEventosDb(antes);
      toast.error((err as Error).message);
    }
  };

  /** Baixa o `.ics` dos eventos À VISTA (o período carregado, com os filtros e o que está oculto). */
  const exportar = () => {
    const ics = gerarIcs(visiveis, { nome: `Calendário — ${textoMes(dados.mes.ano, dados.mes.mes)}`, agora: carimboIcs(new Date()), dominio: window.location.hostname });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    a.download = `calendario-${textoMes(dados.mes.ano, dados.mes.mes)}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast.success(`${visiveis.length} evento(s) exportado(s).`);
  };

  // O link do LEMBRETE (?evento=) abre o evento aqui mesmo — uma vez; a URL fica limpa.
  const inicialAberto = useRef<string | null>(null);
  useEffect(() => {
    if (!eventoInicial) {
      inicialAberto.current = null;
      return;
    }
    if (inicialAberto.current === eventoInicial) return;
    inicialAberto.current = eventoInicial;
    const e = todos.find((x) => x.chave === eventoInicial);
    if (e) setAberto(e);
    else toast.info("O evento não está mais neste mês (ou foi excluído).");
    router.replace(`/painel/calendario?mes=${textoMes(dados.mes.ano, dados.mes.mes)}`, { scroll: false });
  }, [eventoInicial, todos, router, dados.mes.ano, dados.mes.mes]);
  /** Um resultado da BUSCA em todos os meses: no período à vista abre na hora; senão vai ao mês dele e abre lá. */
  const irParaResultado = (r: ResultadoBusca) => {
    const e = todos.find((x) => x.chave === r.chave);
    if (e) {
      setCriacao(null);
      setTarefaSolta(null);
      setVerTarefa(false);
      setAberto(e);
    } else iniciar(() => router.push(linkEvento(r.data, r.chave), { scroll: false }));
  };

  // ─── Criação rápida ──────────────────────────────────────────────────────────────────────────────────────────
  const primeiraAberta = (quadroId: number) => dados.listas.find((l) => l.quadroId === quadroId && !l.concluida)?.id ?? null;
  const abrirCriar = (slot: SlotCriar) => {
    setAberto(null);
    setVerTarefa(false);
    const q = dados.quadros[0]?.id ?? 0;
    setCriacao({
      slot,
      tipo: dados.abertas.length ? "evento" : "tarefa",
      titulo: "",
      data: slot.data,
      comHora: !!slot.hora,
      hora: slot.hora ?? "09:00",
      horaFim: slot.horaFim ?? (slot.hora ? horaDeMinutos(minutosDe(slot.hora) + 60) : "10:00"),
      tarefaId: "",
      quadroId: q,
      listaId: primeiraAberta(q),
    });
  };
  const rascunho = criacao ? { data: criacao.data, hora: criacao.tipo === "evento" && criacao.comHora ? criacao.hora : null, horaFim: criacao.horaFim, titulo: criacao.titulo } : null;
  const eventoDaCriacao = (c: Criacao): RascunhoEvento => ({
    ...rascunhoEvento({ data: c.data }, opcoes.lembretePadrao),
    titulo: c.titulo,
    diaInteiro: !c.comHora,
    horaInicio: c.comHora ? c.hora : "",
    horaFim: c.comHora ? c.horaFim : "",
  });
  const problemaCriacao = (c: Criacao): string | null => {
    if (!c.titulo.trim()) return "Dê um título.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.data)) return "Escolha a data.";
    if (c.tipo === "evento") {
      if (!c.tarefaId) return "Escolha a tarefa do evento.";
      if (c.comHora && (!horaValida(c.hora) || (horaValida(c.horaFim) && c.horaFim <= c.hora))) return "O fim tem de ser depois do início.";
    } else if (!c.listaId) return "O quadro não tem lista aberta.";
    return null;
  };
  /** Grava a criação rápida; `abrir` = "Mais opções" da TAREFA (cria e abre a tarefa ao lado). */
  const salvarCriacao = async (abrir = false) => {
    if (!criacao || problemaCriacao(criacao)) return;
    setSalvando(true);
    try {
      if (criacao.tipo === "evento") {
        const d = dadosDoEvento(eventoDaCriacao(criacao));
        await chamar(`/api/tarefas/${criacao.tarefaId}/eventos`, "POST", d);
        toast.success("Evento criado.");
      } else {
        const nova = await chamar<{ id: number; ticket: number }>("/api/tarefas", "POST", { quadroId: criacao.quadroId, listaId: criacao.listaId, titulo: criacao.titulo.trim(), prazo: criacao.data });
        toast.success(`Tarefa ${rotuloTicket(nova.ticket)} criada.`);
        if (abrir) setTarefaSolta(nova.id);
      }
      setCriacao(null);
      atualizar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  };
  /** "Mais opções" do EVENTO: o formulário completo com o que já foi preenchido. */
  const maisOpcoes = () => {
    if (!criacao) return;
    if (criacao.tipo === "tarefa") return salvarCriacao(true);
    setEdicao({ eventoId: null, tarefaId: criacao.tarefaId, r: eventoDaCriacao(criacao) });
    setCriacao(null);
  };

  const salvarEdicao = async () => {
    if (!edicao || Object.keys(problemasEvento(edicao.r)).length || (!edicao.eventoId && !edicao.tarefaId)) return;
    setSalvando(true);
    try {
      const d = dadosDoEvento(edicao.r);
      if (edicao.eventoId) await chamar(`/api/tarefas/eventos/${edicao.eventoId}`, "PATCH", d);
      else await chamar(`/api/tarefas/${edicao.tarefaId}/eventos`, "POST", d);
      toast.success(edicao.eventoId ? "Evento salvo." : "Evento criado.");
      setEdicao(null);
      setAberto(null);
      atualizar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  };
  const excluir = async (e: EventoCalendario) => {
    const ev = eventosDb.find((x) => x.id === e.eventoId);
    if (!ev || !(await confirmar({ titulo: `Excluir o evento "${e.titulo}"?`, confirmar: "Excluir", perigo: true }))) return;
    try {
      await chamar(`/api/tarefas/eventos/${ev.id}`, "DELETE");
      setEventosDb((l) => l.filter((x) => x.id !== ev.id));
      setAberto(null);
      comDesfazer("Evento excluído.", () => chamar(`/api/tarefas/${ev.tarefaId}/eventos`, "POST", dadosDoEventoGravado(ev)));
      atualizar();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const fecharTudo = () => {
    setVerTarefa(false);
    setAberto(null);
  };
  const cor = (e: EventoCalendario) => (e.pca ? "var(--info)" : e.externo ? (e.cor ?? "var(--muted)") : (e.cor ?? porQuadro.get(e.quadroId)?.cor ?? "var(--accent)"));
  const banner = aberto && (
    <EventoBanner
      evento={aberto}
      cor={cor(aberto)}
      quadroNome={aberto.pca || aberto.externo ? undefined : porQuadro.get(aberto.quadroId)?.nome}
      hoje={dados.hoje}
      tarefaAberta={verTarefa && !!ctx}
      onVerTarefa={aberto.pca || aberto.externo ? undefined : () => setVerTarefa(true)}
      onAbrirPca={aberto.pca ? () => router.push(`/painel/pca/${aberto.pca?.pcaId}?aba=mesa`) : undefined}
      avisoPrazo={aberto.pca || aberto.externo || aberto.concluida ? null : avisoDiaNaoUtil(aberto.tarefaPrazo, feriadosPeriodo)}
      onDuplicar={
        aberto.eventoId
          ? () => {
              const ev = eventosDb.find((x) => x.id === aberto.eventoId);
              if (ev) setEdicao({ eventoId: null, tarefaId: String(ev.tarefaId), r: rascunhoEvento(ev) });
            }
          : undefined
      }
      onEditar={
        aberto.eventoId
          ? () => {
              const ev = eventosDb.find((x) => x.id === aberto.eventoId);
              if (ev) setEdicao({ eventoId: ev.id, tarefaId: String(ev.tarefaId), r: rascunhoEvento(ev) });
            }
          : undefined
      }
      onExcluir={aberto.eventoId ? () => excluir(aberto) : undefined}
      pessoas={dados.pessoas}
      usuarioId={usuarioId}
      onResponder={(r) => r !== "pendente" && responder(aberto, r)}
    />
  );
  const opcoesTarefas = useMemo(
    () => dados.abertas.map((t) => ({ valor: String(t.id), rotulo: `${rotuloTicket(t.ticket)} ${t.titulo}`, detalhe: porQuadro.get(t.quadroId)?.nome })),
    [dados.abertas, porQuadro],
  );

  if (!dados.quadros.length && !dados.pca.pcas.length)
    return <p className="rounded-card border border-dashed border-border-2 bg-surface px-6 py-12 text-center text-sm text-muted">Nenhum quadro de tarefas ativo neste grupo.</p>;

  const erroCriacao = criacao ? problemaCriacao(criacao) : null;
  return (
    <div className={`transition-opacity ${carregando ? "opacity-70" : ""}`} aria-busy={carregando}>
      <CalendarioTarefas
        eventos={visiveis}
        hoje={dados.hoje}
        mes={dados.mes}
        onMes={irMes}
        onAno={irAno}
        contadores={dados.contadores}
        corQuadro={(id) => porQuadro.get(id)?.cor}
        nomeQuadro={(id) => porQuadro.get(id)?.nome}
        onAbrir={(e) => {
          setCriacao(null);
          setTarefaSolta(null);
          setVerTarefa(false);
          setAberto(e);
        }}
        onCriar={dados.quadros.length ? abrirCriar : undefined}
        onMover={mover}
        onRedimensionar={redimensionar}
        onConcluir={concluir}
        opcoes={opcoes}
        onOpcoes={mudarOpcoes}
        feriados={feriadosVisiveis}
        rascunho={rascunho}
        usuarioId={usuarioId}
        semPrazo={semPrazo}
        onAbrirTarefa={(id) => {
          setAberto(null);
          setTarefaSolta(id);
        }}
        configuracoes={<AssinaturaCalendario ativa={dados.assinatura} onExportar={exportar} nEventos={visiveis.length} />}
        rotuloLateral={nOcultos ? `Filtros e conjuntos (${nOcultos} ocultos)` : "Filtros e conjuntos"}
        lateral={(nav) => (
          <div className="space-y-[var(--gap-block)]">
            <BuscaCalendario valor={filtro.busca} onChange={(busca) => setFiltro({ ...filtro, busca })} hoje={dados.hoje} corQuadro={(id) => porQuadro.get(id)?.cor} onEscolher={irParaResultado} />
            <div className="flex flex-wrap items-center gap-1.5">
              <FiltrosTarefas filtro={filtro} onChange={setFiltro} pessoas={dados.pessoas} etiquetas={etiquetas} usuarioId={usuarioId} semBusca />
            </div>
            <ChipsFiltrosTarefas filtro={filtro} onChange={setFiltro} pessoas={dados.pessoas} etiquetas={etiquetas} usuarioId={usuarioId} />
            {membros.length > 1 && (
              <details className="rounded-card border border-border bg-surface p-2" open={pessoasVer.length > 0}>
                <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 px-1 text-[12px] font-semibold text-text-2 lg:min-h-8">
                  <IconUsers className="h-3.5 w-3.5 text-muted" />
                  Pesquisar pessoas{pessoasVer.length ? ` (${pessoasVer.length})` : ""}
                </summary>
                <div className="space-y-2 px-1 pb-1 pt-1.5">
                  <SeletorPessoas pessoas={membros} selecionadas={pessoasVer} onChange={setPessoasVer} usuarioId={usuarioId} />
                  {pessoasVer.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setPessoasVer([])}>
                      Ver todos
                    </Button>
                  )}
                </div>
              </details>
            )}
            {dados.truncado && <Callout kind="warn">Há eventos demais neste período — alguns ficaram de fora. Use os filtros ou oculte conjuntos.</Callout>}
            <BarraCalendario
              nav={nav}
              hoje={dados.hoje}
              diasComEvento={diasComEvento}
              grupos={grupos}
              pcas={pcasConjuntos}
              externos={externosConjuntos}
              onGerirExternos={() => setGerirExternas(true)}
              porTipo={porTipo}
              feriadosNoPeriodo={feriadosPeriodo.size}
              ocultos={ocultos}
              onOcultos={mudarOcultos}
              inicioSemana={inicioSemana}
            />
          </div>
        )}
      />

      {/* CRIAÇÃO RÁPIDA — a janela ao lado do ponto clicado (no celular, folha). */}
      <JanelaFlutuante
        aberta={!!criacao}
        ancora={criacao?.slot.ancora ?? null}
        titulo="Criar"
        onFechar={() => !salvando && setCriacao(null)}
        rodape={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={salvando || (criacao?.tipo === "tarefa" && !!erroCriacao)} onClick={maisOpcoes}>
              Mais opções
            </Button>
            <Button size="sm" loading={salvando} disabled={!!erroCriacao} title={erroCriacao ?? undefined} onClick={() => salvarCriacao()}>
              Salvar
            </Button>
          </div>
        }
      >
        {criacao && (
          <form
            className="space-y-3"
            onSubmit={(ev) => {
              ev.preventDefault();
              void salvarCriacao();
            }}
          >
            <TextField
              label="Título"
              autoFocus
              value={criacao.titulo}
              maxLength={criacao.tipo === "evento" ? 120 : 200}
              placeholder={criacao.tipo === "evento" ? "Adicionar título do evento" : "Adicionar título da tarefa"}
              onChange={(e) => setCriacao({ ...criacao, titulo: e.target.value })}
            />
            {dados.abertas.length > 0 && (
              <Segmented<"evento" | "tarefa">
                ariaLabel="Criar evento ou tarefa"
                value={criacao.tipo}
                onChange={(tipo) => setCriacao({ ...criacao, tipo })}
                options={[
                  { value: "evento", label: "Evento" },
                  { value: "tarefa", label: "Tarefa" },
                ]}
              />
            )}
            <div className="flex items-start gap-2.5">
              <IconClock className="mt-3 h-4 w-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1 space-y-2">
                <TextField label={criacao.tipo === "tarefa" ? "Prazo" : "Data"} type="date" value={criacao.data} onChange={(e) => setCriacao({ ...criacao, data: e.target.value })} />
                {criacao.tipo === "evento" &&
                  (criacao.comHora ? (
                    <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                      <TextField label="Início" type="time" value={criacao.hora} onChange={(e) => setCriacao({ ...criacao, hora: e.target.value })} />
                      <TextField label="Fim" type="time" value={criacao.horaFim} onChange={(e) => setCriacao({ ...criacao, horaFim: e.target.value })} />
                      <Button variant="ghost" size="sm" onClick={() => setCriacao({ ...criacao, comHora: false })}>
                        Dia todo
                      </Button>
                    </div>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => setCriacao({ ...criacao, comHora: true })}>
                      Adicionar horário
                    </Button>
                  ))}
              </div>
            </div>
            {criacao.tipo === "evento" ? (
              <div>
                <p className="mb-1.5 text-[13px] font-semibold text-text">Tarefa</p>
                <SeletorBusca
                  opcoes={opcoesTarefas}
                  valor={criacao.tarefaId}
                  onChange={(v) => setCriacao({ ...criacao, tarefaId: v })}
                  ariaLabel="Tarefa do evento"
                  placeholder="Buscar tarefa por título ou #ticket"
                />
              </div>
            ) : (
              <div className="flex items-start gap-2.5">
                <IconKanban className="mt-3 h-4 w-4 shrink-0 text-muted" aria-hidden />
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                  <SelectField
                    label="Quadro"
                    value={String(criacao.quadroId)}
                    onChange={(e) => {
                      const q = Number(e.target.value);
                      setCriacao({ ...criacao, quadroId: q, listaId: primeiraAberta(q) });
                    }}
                  >
                    {dados.quadros.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.nome}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField label="Lista" value={String(criacao.listaId ?? "")} onChange={(e) => setCriacao({ ...criacao, listaId: Number(e.target.value) || null })}>
                    {dados.listas
                      .filter((l) => l.quadroId === criacao.quadroId)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nome}
                          {l.concluida ? " (concluídas)" : ""}
                        </option>
                      ))}
                  </SelectField>
                </div>
              </div>
            )}
            <button type="submit" hidden aria-hidden tabIndex={-1} />
          </form>
        )}
      </JanelaFlutuante>

      {/* O EVENTO (e, com "Ver tarefa", a TAREFA ao lado) — ou uma TAREFA solta — sem sair do calendário. */}
      {idTarefa != null && ctx ? (
        <TarefaDetalhe
          aberto={{ tipo: "editar", id: idTarefa }}
          quadroId={ctx.quadro.id}
          tarefas={[ctx.tarefa]}
          listas={ctx.listas.filter((l) => !l.arquivada)}
          etiquetas={ctx.etiquetas}
          pessoas={ctx.pessoas.filter((p) => ctx.membros.includes(p.id))}
          todas={ctx.pessoas}
          hoje={dados.hoje}
          usuarioId={usuarioId}
          podeExcluir={ctx.podeEditar}
          modelos={ctx.modelosTarefa}
          onFechar={() => {
            setVerTarefa(false);
            setTarefaSolta(null);
          }}
          onSalvo={() => {
            atualizarTarefa();
            atualizar();
          }}
          esquerda={aberto && tarefaSolta == null ? [{ id: "evento", aberto: true, largura: 26, titulo: "Evento", onClose: fecharTudo, children: banner }] : undefined}
        />
      ) : (
        <Modal open={!!aberto} onClose={fecharTudo} titulo="Evento" size="md">
          {banner}
        </Modal>
      )}

      <Modal
        open={!!edicao}
        onClose={() => !salvando && setEdicao(null)}
        titulo={edicao?.eventoId ? "Editar evento" : `Novo evento${edicao?.r.data ? ` — ${dataBR(edicao.r.data)}` : ""}`}
        size="md"
        bloqueado={salvando}
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={salvando} onClick={() => setEdicao(null)}>
              Cancelar
            </Button>
            <Button loading={salvando} disabled={!edicao || Object.keys(problemasEvento(edicao.r)).length > 0 || (!edicao.eventoId && !edicao.tarefaId)} onClick={salvarEdicao}>
              {edicao?.eventoId ? "Salvar" : "Criar evento"}
            </Button>
          </div>
        }
      >
        {edicao && (
          <div className="space-y-4">
            {!edicao.eventoId && (
              <div>
                <p className="mb-2 text-[13.5px] font-bold text-text">Tarefa</p>
                <SeletorBusca
                  opcoes={opcoesTarefas}
                  valor={edicao.tarefaId}
                  onChange={(v) => setEdicao({ ...edicao, tarefaId: v })}
                  ariaLabel="Tarefa do evento"
                  placeholder="Buscar tarefa por título ou #ticket"
                />
              </div>
            )}
            <EditorEvento valor={edicao.r} onChange={(r) => setEdicao({ ...edicao, r })} disabled={salvando} pessoas={membros.length ? membros : undefined} usuarioId={usuarioId} />
          </div>
        )}
      </Modal>
      <GerirAgendasExternas aberto={gerirExternas} onFechar={() => setGerirExternas(false)} agendas={externas.agendas} onMudou={() => void externas.recarregar()} />
      {confirmacao}
    </div>
  );
}
