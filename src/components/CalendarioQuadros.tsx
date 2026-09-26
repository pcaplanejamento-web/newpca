"use client";

import { useRouter } from "next/navigation";
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
  type OpcoesCalendario,
} from "@/lib/calendario-core";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { dataBR, } from "@/lib/format";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { Pessoa } from "@/lib/pessoa";
import { predicadoBusca } from "@/lib/tabela-filtros";
import {
  CHAVE_OCULTOS_CALENDARIO,
  type EtiquetaTarefa,
  type EventoCalendario,
  type EventoTarefa,
  eventosDoCalendario,
  eventoVisivel,
  FILTRO_TAREFAS_PADRAO,
  type FiltroTarefas,
  filtrarTarefas,
  gradeMes,
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
import { BarraCalendario, type ConjuntoPca, type GrupoConjuntos } from "./BarraCalendario";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CalendarioTarefas } from "./CalendarioTarefas";
import { useConfirmacao } from "./Confirmacao";
import { EventoBanner } from "./EventoBanner";
import { dadosDoEvento, EditorEvento, problemasEvento, type RascunhoEvento, rascunhoEvento } from "./EventosTarefa";
import { ChipsFiltrosTarefas, FiltrosTarefas } from "./FiltrosTarefas";
import { Modal } from "./Modal";
import { SeletorBusca } from "./SeletorBusca";
import { TarefaDetalhe } from "./TarefaDetalhe";
import { toast } from "./Toast";

/** O que o módulo Calendário recebe do servidor (`carregarCalendario`). */
export type DadosCalendarioQuadros = {
  tarefas: (TarefaCalendario & { quadroId: number })[];
  eventos: EventoTarefa[];
  contadores: { atrasadas: number; hoje: number; naSemana: number; semPrazo: number };
  mes: { ano: number; mes: number };
  hoje: string;
  etiquetas: (EtiquetaTarefa & { quadroId: number })[];
  pessoas: Pessoa[];
  abertas: { id: number; quadroId: number; ticket: number; titulo: string }[];
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

/** Edição de um evento no modal do Calendário (novo = escolhe a tarefa). */
type Edicao = { eventoId: number | null; tarefaId: string; r: RascunhoEvento };

/**
 * MÓDULO CALENDÁRIO (`/painel/calendario`, permissão própria `calendario`): os EVENTOS de todos os quadros do grupo — o
 * PERÍODO de cada tarefa (início → prazo), as OCORRÊNCIAS da recorrência e os EVENTOS cadastrados (bloco "Eventos") — no
 * `CalendarioTarefas` (Dia · Semana · Mês · Agenda), com a `BarraCalendario` (mini-mês, TIPOS e CONJUNTOS: cada tarefa é
 * um conjunto; o que fica oculto é a preferência da pessoa, gravada em todos os aparelhos). Tocar num evento abre o BANNER
 * DO EVENTO aqui mesmo e "Ver tarefa" abre a tarefa AO LADO — nada sai da tela. "Criar" (ou um horário vazio) cadastra
 * um evento numa tarefa; arrastar reagenda; a borda de baixo muda a duração. Também: a PREVISÃO do PCA (cronograma de
 * contratações — quem vê o PCA), os FERIADOS (nacionais + os do ADM; o prazo em dia não útil é apontado), as OPÇÕES da
 * pessoa (semana na segunda, sem fim de semana), exportar/assinar `.ics` e `eventoInicial` (o link do lembrete abre o
 * evento). Os filtros da barra (responsável, prazo, prioridade, etiqueta, busca) valem para as tarefas.
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
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();
  const { ctx, atualizarTarefa } = useContextoTarefa(aberto && verTarefa && !aberto.pca ? aberto.tarefaId : null);

  const porQuadro = useMemo(() => new Map(dados.quadros.map((q) => [q.id, q])), [dados.quadros]);
  const variosQuadros = dados.quadros.length > 1;
  const etiquetas = useMemo(
    () => dados.etiquetas.map((e) => (variosQuadros ? { ...e, nome: `${e.nome} · ${porQuadro.get(e.quadroId)?.nome ?? ""}` } : e)),
    [dados.etiquetas, porQuadro, variosQuadros],
  );
  const inicioSemana = opcoes.inicioSegunda ? 1 : 0;
  const grade = useMemo(() => gradeMes(dados.mes.ano, dados.mes.mes, inicioSemana), [dados.mes.ano, dados.mes.mes, inicioSemana]);
  const de = grade[0][0];
  const ate = grade.at(-1)?.[6] ?? grade[0][6];
  /** Os feriados do período (todos — o aviso do prazo); a grade só os mostra se não estiverem ocultos. */
  const feriadosPeriodo = useMemo(() => feriadosNoIntervalo(dados.feriados, de, ate), [dados.feriados, de, ate]);
  const feriadosVisiveis = ocultos.feriados ? undefined : feriadosPeriodo;
  const filtrando = filtro.responsavel !== FILTRO_TAREFAS_PADRAO.responsavel || filtro.prazo !== FILTRO_TAREFAS_PADRAO.prazo || filtro.prioridade !== FILTRO_TAREFAS_PADRAO.prioridade || filtro.etiqueta !== FILTRO_TAREFAS_PADRAO.etiqueta;

  // Os eventos do período: as tarefas passam pelos filtros da barra; a PREVISÃO do PCA só quando nenhum filtro de TAREFA
  // está ligado (responsável/prazo/prioridade/etiqueta não se aplicam a um DFD). A busca vale em todos (título, tarefa,
  // local, #, DFD).
  const todos = useMemo(() => {
    const t = filtrarTarefas(tarefas, { ...filtro, busca: "" }, { usuarioId, hoje: dados.hoje });
    const casa = predicadoBusca(filtro.busca);
    const ev = [...eventosDoCalendario(t, eventosDb, de, ate, dados.hoje), ...(filtrando ? [] : eventosPca(dados.pca.dfds, de, ate))];
    return casa
      ? ev.filter((e) => casa([e.titulo, e.tarefaTitulo, e.local ?? "", e.pca ? `DFD ${e.pca.numero} ${e.pca.planejamento ?? ""} ${e.pca.sigla ?? ""}` : `${rotuloTicket(e.ticket)} ${e.ticket}`]))
      : ev;
  }, [tarefas, eventosDb, filtro, filtrando, usuarioId, dados.hoje, dados.pca.dfds, de, ate]);
  const visiveis = useMemo(() => todos.filter((e) => eventoVisivel(e, ocultos)), [todos, ocultos]);
  const grupos = useMemo<GrupoConjuntos[]>(() => {
    const m = new Map<number, Map<number, { id: number; ticket: number; titulo: string; eventos: number }>>();
    for (const e of todos) {
      if (e.pca) continue;
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
  const nOcultos = ocultos.tarefas.length + ocultos.quadros.length + ocultos.pcas.length + ocultos.tipos.length + Number(ocultos.feriados);

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

  /** As OPÇÕES (semana na segunda / sem fim de semana): gravam na hora; a semana nova muda a grade — o servidor recarrega. */
  const mudarOpcoes = (o: OpcoesCalendario) => {
    const mudouInicio = o.inicioSegunda !== opcoes.inicioSegunda;
    setOpcoes(o);
    gravarPreferencia(CHAVE_OPCOES_CALENDARIO, o)
      .then(() => mudouInicio && atualizar())
      .catch(() => toast.error("Não foi possível guardar as opções do calendário."));
  };

  const irMes = (m: { ano: number; mes: number }) => iniciar(() => router.push(`/painel/calendario?mes=${textoMes(m.ano, m.mes)}`, { scroll: false }));
  const atualizar = () => iniciar(() => router.refresh());

  /** ARRASTAR: o período muda o prazo (o início anda junto); o evento muda a data (e a hora, na grade — a duração fica). */
  const mover = async (e: EventoCalendario, dia: string, hora: string | null) => {
    if (e.tipo === "periodo") {
      const t = tarefas.find((x) => x.id === e.tarefaId);
      if (!t) return;
      const antes = tarefas;
      const novo = reagendar(t, dia);
      setTarefas(antes.map((x) => (x.id === t.id ? { ...x, ...novo } : x)));
      try {
        await chamar(`/api/tarefas/${t.id}`, "PATCH", novo);
        const aviso = avisoDiaNaoUtil(dia, feriadosPeriodo);
        if (aviso) toast.info(`${rotuloTicket(t.ticket)} reagendada para ${dataBR(dia)} — o prazo ${aviso}.`);
        else toast.success(`${rotuloTicket(t.ticket)} reagendada para ${dataBR(dia)}.`);
        atualizar();
      } catch (err) {
        setTarefas(antes);
        toast.error((err as Error).message);
      }
      return;
    }
    const ev = eventosDb.find((x) => x.id === e.eventoId);
    if (!ev) return;
    const d = eventoMovido(ev, dia, hora);
    const antes = eventosDb;
    setEventosDb(antes.map((x) => (x.id === ev.id ? { ...x, ...d } : x)));
    try {
      await chamar(`/api/tarefas/eventos/${ev.id}`, "PATCH", d);
      toast.success(`"${ev.titulo}" movido para ${dataBR(dia)}${d.horaInicio && !d.diaInteiro ? ` às ${d.horaInicio}` : ""}.`);
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
      toast.success(`"${ev.titulo}" agora vai até ${horaFim}.`);
      atualizar();
    } catch (err) {
      setEventosDb(antes);
      toast.error((err as Error).message);
    }
  };

  /** Baixa o `.ics` dos eventos À VISTA (o mês, com os filtros e o que está oculto). */
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
  const inicialAberto = useRef(false);
  useEffect(() => {
    if (inicialAberto.current || !eventoInicial) return;
    inicialAberto.current = true;
    const e = todos.find((x) => x.chave === eventoInicial);
    if (e) setAberto(e);
    else toast.info("O evento do lembrete não está mais neste mês (ou foi excluído).");
    router.replace(`/painel/calendario?mes=${textoMes(dados.mes.ano, dados.mes.mes)}`, { scroll: false });
  }, [eventoInicial, todos, router, dados.mes.ano, dados.mes.mes]);

  const abrirCriar = (slot: { data: string; hora: string | null }, tarefaId = "") =>
    setEdicao({ eventoId: null, tarefaId, r: { ...rascunhoEvento({ data: slot.data }), diaInteiro: !slot.hora, horaInicio: slot.hora ?? "" } });
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
    if (!e.eventoId || !(await confirmar({ titulo: `Excluir o evento "${e.titulo}"?`, confirmar: "Excluir", perigo: true }))) return;
    try {
      await chamar(`/api/tarefas/eventos/${e.eventoId}`, "DELETE");
      setEventosDb((l) => l.filter((x) => x.id !== e.eventoId));
      setAberto(null);
      toast.success("Evento excluído.");
      atualizar();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const fecharTudo = () => {
    setVerTarefa(false);
    setAberto(null);
  };
  const cor = (e: EventoCalendario) => (e.pca ? "var(--info)" : (e.cor ?? porQuadro.get(e.quadroId)?.cor ?? "var(--accent)"));
  const banner = aberto && (
    <EventoBanner
      evento={aberto}
      cor={cor(aberto)}
      quadroNome={aberto.pca ? undefined : porQuadro.get(aberto.quadroId)?.nome}
      hoje={dados.hoje}
      tarefaAberta={verTarefa && !!ctx}
      onVerTarefa={aberto.pca ? undefined : () => setVerTarefa(true)}
      onAbrirPca={aberto.pca ? () => router.push(`/painel/pca/${aberto.pca?.pcaId}?aba=mesa`) : undefined}
      avisoPrazo={aberto.pca || aberto.concluida ? null : avisoDiaNaoUtil(aberto.tarefaPrazo, feriadosPeriodo)}
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
    />
  );
  const opcoesTarefas = useMemo(
    () => dados.abertas.map((t) => ({ valor: String(t.id), rotulo: `${rotuloTicket(t.ticket)} ${t.titulo}`, detalhe: porQuadro.get(t.quadroId)?.nome })),
    [dados.abertas, porQuadro],
  );

  if (!dados.quadros.length && !dados.pca.pcas.length)
    return <p className="rounded-card border border-dashed border-border-2 bg-surface px-6 py-12 text-center text-sm text-muted">Nenhum quadro de tarefas ativo neste grupo.</p>;

  return (
    <div className={`space-y-[var(--gap-block)] transition-opacity ${carregando ? "opacity-70" : ""}`} aria-busy={carregando}>
      <div className="flex flex-wrap items-center gap-2">
        <FiltrosTarefas filtro={filtro} onChange={setFiltro} pessoas={dados.pessoas} etiquetas={etiquetas} usuarioId={usuarioId} />
      </div>
      <ChipsFiltrosTarefas filtro={filtro} onChange={setFiltro} pessoas={dados.pessoas} etiquetas={etiquetas} usuarioId={usuarioId} />
      {dados.truncado && (
        <Callout kind="warn">
          Há eventos demais neste mês para mostrar todos de uma vez — alguns ficaram de fora. Use os filtros (responsável, etiqueta, busca) ou oculte conjuntos.
        </Callout>
      )}
      <CalendarioTarefas
        eventos={visiveis}
        hoje={dados.hoje}
        mes={dados.mes}
        onMes={irMes}
        contadores={dados.contadores}
        corQuadro={(id) => porQuadro.get(id)?.cor}
        onAbrir={(e) => {
          setVerTarefa(false);
          setAberto(e);
        }}
        onCriar={dados.abertas.length ? abrirCriar : undefined}
        onMover={mover}
        onRedimensionar={redimensionar}
        opcoes={opcoes}
        feriados={feriadosVisiveis}
        rotuloLateral={nOcultos ? `Conjuntos (${nOcultos} ocultos)` : "Conjuntos"}
        lateral={(nav) => (
          <BarraCalendario
            nav={nav}
            hoje={dados.hoje}
            diasComEvento={diasComEvento}
            grupos={grupos}
            pcas={pcasConjuntos}
            porTipo={porTipo}
            feriadosNoPeriodo={feriadosPeriodo.size}
            ocultos={ocultos}
            onOcultos={mudarOcultos}
            opcoes={opcoes}
            onOpcoes={mudarOpcoes}
            extras={<AssinaturaCalendario ativa={dados.assinatura} onExportar={exportar} nEventos={visiveis.length} />}
          />
        )}
      />

      {/* O EVENTO (e, com "Ver tarefa", a TAREFA ao lado) — sem sair do calendário. */}
      {aberto && verTarefa && ctx ? (
        <TarefaDetalhe
          aberto={{ tipo: "editar", id: aberto.tarefaId }}
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
          onFechar={() => setVerTarefa(false)}
          onSalvo={() => {
            atualizarTarefa();
            atualizar();
          }}
          esquerda={[{ id: "evento", aberto: true, largura: 26, titulo: "Evento", onClose: fecharTudo, children: banner }]}
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
            <EditorEvento valor={edicao.r} onChange={(r) => setEdicao({ ...edicao, r })} disabled={salvando} />
          </div>
        )}
      </Modal>
      {confirmacao}
    </div>
  );
}
