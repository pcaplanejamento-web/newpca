"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { dataBR } from "@/lib/format";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { Pessoa } from "@/lib/pessoa";
import { predicadoBusca } from "@/lib/tabela-filtros";
import {
  CHAVE_OCULTOS_CALENDARIO,
  type DadosEvento,
  type EtiquetaTarefa,
  type EventoCalendario,
  type EventoTarefa,
  eventosDoCalendario,
  eventoVisivel,
  FILTRO_TAREFAS_PADRAO,
  type FiltroTarefas,
  filtrarTarefas,
  gradeMes,
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
import { BarraCalendario, type GrupoConjuntos } from "./BarraCalendario";
import { Button } from "./Button";
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
  quadros: { id: number; nome: string; cor: string }[];
};

/** O CONTEXTO do quadro de uma tarefa (o banner da tarefa aberto no Calendário) — lido sob demanda. */
function useContextoTarefa(tarefaId: number | null) {
  const [ctx, setCtx] = useState<ContextoTarefa | null>(null);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    if (tarefaId == null) return setCtx(null);
    let vivo = true;
    chamar<{ contexto: ContextoTarefa }>(`/api/tarefas/${tarefaId}?contexto=1&v=${versao}`)
      .then((j) => vivo && setCtx(j.contexto))
      .catch((e) => vivo && toast.error((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [tarefaId, versao]);
  return { ctx: ctx && ctx.tarefa.id === tarefaId ? ctx : null, recarregar: useCallback(() => setVersao((v) => v + 1), []) };
}

/** Edição de um evento no modal do Calendário (novo = escolhe a tarefa). */
type Edicao = { eventoId: number | null; tarefaId: string; r: RascunhoEvento };

/**
 * MÓDULO CALENDÁRIO (`/painel/calendario`, permissão própria `calendario`): os EVENTOS de todos os quadros do grupo — o
 * PERÍODO de cada tarefa (início → prazo), as OCORRÊNCIAS da recorrência e os EVENTOS cadastrados (bloco "Eventos") — no
 * `CalendarioTarefas` (Dia · Semana · Mês · Agenda), com a `BarraCalendario` (mini-mês, TIPOS e CONJUNTOS: cada tarefa é
 * um conjunto; o que fica oculto é a preferência da pessoa, gravada em todos os aparelhos). Tocar num evento abre o BANNER
 * DO EVENTO aqui mesmo e "Ver tarefa" abre a tarefa AO LADO — nada sai da tela. "Criar" (ou um horário vazio) cadastra
 * um evento numa tarefa; arrastar reagenda. Os filtros da barra (responsável, prazo, prioridade, etiqueta, busca) valem.
 */
export function CalendarioQuadros({ dados, usuarioId }: { dados: DadosCalendarioQuadros; usuarioId: number }) {
  const router = useRouter();
  const [carregando, iniciar] = useTransition();
  const [filtro, setFiltro] = useState<FiltroTarefas>(FILTRO_TAREFAS_PADRAO);
  const [tarefas, setTarefas] = useState(dados.tarefas);
  const [eventosDb, setEventosDb] = useState(dados.eventos);
  useEffect(() => setTarefas(dados.tarefas), [dados.tarefas]);
  useEffect(() => setEventosDb(dados.eventos), [dados.eventos]);
  const [ocultos, setOcultos] = useState(dados.ocultos);
  const [aberto, setAberto] = useState<EventoCalendario | null>(null);
  const [verTarefa, setVerTarefa] = useState(false);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();
  const { ctx, recarregar } = useContextoTarefa(aberto && verTarefa ? aberto.tarefaId : null);

  const porQuadro = useMemo(() => new Map(dados.quadros.map((q) => [q.id, q])), [dados.quadros]);
  const variosQuadros = dados.quadros.length > 1;
  const etiquetas = useMemo(
    () => dados.etiquetas.map((e) => (variosQuadros ? { ...e, nome: `${e.nome} · ${porQuadro.get(e.quadroId)?.nome ?? ""}` } : e)),
    [dados.etiquetas, porQuadro, variosQuadros],
  );
  const grade = useMemo(() => gradeMes(dados.mes.ano, dados.mes.mes), [dados.mes.ano, dados.mes.mes]);
  const de = grade[0][0];
  const ate = grade.at(-1)?.[6] ?? grade[0][6];

  // Os eventos do período: as tarefas passam pelos filtros da barra (a busca vale nos EVENTOS — título, tarefa, local, #).
  const todos = useMemo(() => {
    const t = filtrarTarefas(tarefas, { ...filtro, busca: "" }, { usuarioId, hoje: dados.hoje });
    const casa = predicadoBusca(filtro.busca);
    const ev = eventosDoCalendario(t, eventosDb, de, ate);
    return casa ? ev.filter((e) => casa([e.titulo, e.tarefaTitulo, e.local ?? "", rotuloTicket(e.ticket), String(e.ticket)])) : ev;
  }, [tarefas, eventosDb, filtro, usuarioId, dados.hoje, de, ate]);
  const visiveis = useMemo(() => todos.filter((e) => eventoVisivel(e, ocultos)), [todos, ocultos]);
  const grupos = useMemo<GrupoConjuntos[]>(() => {
    const m = new Map<number, Map<number, { id: number; ticket: number; titulo: string; eventos: number }>>();
    for (const e of todos) {
      const g = m.get(e.quadroId) ?? new Map();
      const t = g.get(e.tarefaId) ?? { id: e.tarefaId, ticket: e.ticket, titulo: e.tarefaTitulo, eventos: 0 };
      t.eventos++;
      g.set(e.tarefaId, t);
      m.set(e.quadroId, g);
    }
    return dados.quadros.filter((q) => m.has(q.id)).map((q) => ({ quadro: q, tarefas: [...(m.get(q.id)?.values() ?? [])].sort((a, b) => a.ticket - b.ticket) }));
  }, [todos, dados.quadros]);
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
  const nOcultos = ocultos.tarefas.length + ocultos.quadros.length + ocultos.tipos.length;

  // O que fica OCULTO é a preferência da pessoa (gravada ~0,6 s depois da última mudança — marcar vários não vira vários PUT).
  const gravar = useRef<number | undefined>(undefined);
  const mudarOcultos = (o: OcultosCalendario) => {
    setOcultos(o);
    window.clearTimeout(gravar.current);
    gravar.current = window.setTimeout(() => {
      chamar("/api/preferencias/tabela", "PUT", { chave: CHAVE_OCULTOS_CALENDARIO, valor: o }).catch(() => toast.error("Não foi possível guardar o que fica oculto."));
    }, 600);
  };
  useEffect(() => () => window.clearTimeout(gravar.current), []);

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
        toast.success(`${rotuloTicket(t.ticket)} reagendada para ${dataBR(dia)}.`);
        atualizar();
      } catch (err) {
        setTarefas(antes);
        toast.error((err as Error).message);
      }
      return;
    }
    const ev = eventosDb.find((x) => x.id === e.eventoId);
    if (!ev) return;
    const { id: _id, tarefaId: _t, ...dados } = ev;
    const d: DadosEvento = { ...dados, data: dia };
    if (hora && !ev.diaInteiro && horaValida(ev.horaInicio)) {
      const dur = horaValida(ev.horaFim) ? minutosDe(ev.horaFim) - minutosDe(ev.horaInicio) : null;
      d.horaInicio = hora;
      d.horaFim = dur != null ? horaDeMinutos(Math.min(minutosDe(hora) + dur, 23 * 60 + 59)) : null;
      if (d.horaFim && d.horaFim <= hora) d.horaFim = null;
    }
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
  const cor = (e: EventoCalendario) => e.cor ?? porQuadro.get(e.quadroId)?.cor ?? "var(--accent)";
  const banner = aberto && (
    <EventoBanner
      evento={aberto}
      cor={cor(aberto)}
      quadroNome={porQuadro.get(aberto.quadroId)?.nome}
      hoje={dados.hoje}
      tarefaAberta={verTarefa && !!ctx}
      onVerTarefa={() => setVerTarefa(true)}
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

  if (!dados.quadros.length)
    return <p className="rounded-card border border-dashed border-border-2 bg-surface px-6 py-12 text-center text-sm text-muted">Nenhum quadro de tarefas ativo neste grupo.</p>;

  return (
    <div className={`space-y-[var(--gap-block)] transition-opacity ${carregando ? "opacity-70" : ""}`} aria-busy={carregando}>
      <div className="flex flex-wrap items-center gap-2">
        <FiltrosTarefas filtro={filtro} onChange={setFiltro} pessoas={dados.pessoas} etiquetas={etiquetas} usuarioId={usuarioId} />
      </div>
      <ChipsFiltrosTarefas filtro={filtro} onChange={setFiltro} pessoas={dados.pessoas} etiquetas={etiquetas} usuarioId={usuarioId} />
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
        rotuloLateral={nOcultos ? `Conjuntos (${nOcultos} ocultos)` : "Conjuntos"}
        lateral={(nav) => (
          <BarraCalendario nav={nav} hoje={dados.hoje} diasComEvento={diasComEvento} grupos={grupos} porTipo={porTipo} ocultos={ocultos} onOcultos={mudarOcultos} />
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
            recarregar();
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
