"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { dataBR, num } from "@/lib/format";
import { exportarTarefasXlsx, linhasPlanilhaTarefas } from "@/lib/exportar-tarefas";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { DadosQuadro } from "@/lib/tarefas-dados";
import {
  cartoesDaLista,
  FILTRO_TAREFAS_PADRAO,
  type FiltroTarefas,
  filtrarTarefas,
  moverCartao,
  contadoresCalendario,
  type EventoCalendario,
  type EventoTarefa,
  eventosDoCalendario,
  gradeMes,
  horaDeMinutos,
  horaValida,
  minutosDe,
  prefixoEdicoesTarefas,
  reagendar,
  resumoQuadro,
  rotuloTicket,
  type TarefaCalendario,
  type VinculoTarefa,
  vizinhos,
} from "@/lib/tarefas-core";
import type { AcaoMassaTarefas } from "@/lib/tarefas-validation";
import { AbasEspaco, FerramentasAba } from "./AbasEspaco";
import { Badge } from "./Badge";
import { BarraEdicaoMassaTarefas } from "./BarraEdicaoMassa";
import { BarraSelecao } from "./BarraSelecao";
import { Button } from "./Button";
import { CalendarioTarefas } from "./CalendarioTarefas";
import { ConfiguracaoQuadro } from "./ConfiguracaoQuadro";
import { DashboardMesaEsqueleto } from "./DashboardMesaEsqueleto";
import type { EdicoesDaTabela } from "./DataTable";
import { ChipsFiltrosTarefas, FiltrosTarefas } from "./FiltrosTarefas";
import { tokenPx } from "./espacamento";
import { IconArquivar, IconChevronLeft, IconDownload, IconPlus } from "./icons";
import { QuadroKanban } from "./QuadroKanban";
import { SeletorFiltro } from "./SeletorFiltro";
import { TabelaTarefas } from "./TabelaTarefas";
import { type AberturaTarefa, TarefaDetalhe } from "./TarefaDetalhe";
import { toast } from "./Toast";

export type AbaQuadro = "dashboard" | "quadro" | "lista" | "calendario" | "configuracao";

/** O Dashboard (gráficos) só baixa quando a aba abre — a MESMA grade de esqueleto do Dashboard da Mesa. */
const DashboardTarefas = dynamic(() => import("./DashboardTarefas").then((m) => m.DashboardTarefas), {
  ssr: false,
  loading: () => <DashboardMesaEsqueleto />,
});

/** Até quantas tarefas por chamada da edição em massa (o teto do schema). */
const LOTE_MASSA = 50;

/**
 * ESPAÇO DE UM QUADRO de tarefas (`/painel/tarefas/[id]`): UMA linha de cabeçalho (voltar · cor · nome · grupo · abertas ·
 * atrasadas · concluídas) e as abas **Quadro · Lista · Calendário · Dashboard · Configuração** (`AbasEspaco`; no celular,
 * rótulos curtos), com os FILTROS na mesma linha (`FerramentasAba`) e os ativos por extenso logo abaixo. CRIAR TAREFA é
 * UM fluxo só — o BANNER da tarefa (`TarefaDetalhe`), aberto de onde se está: no Quadro pelo "Adicionar tarefa" da
 * coluna (naquela lista), na Lista pelo botão da barra e no Calendário pelo "+" de um dia (prazo = o dia); no Calendário,
 * arrastar uma tarefa para outro dia a REAGENDA (otimista). Os cartões ficam num estado LOCAL (arrastar é otimista — a ordem gravada volta
 * com o `router.refresh`); o filtro segue de uma aba para a outra. Na Lista: seleção + EDIÇÃO EM MASSA e exportar .xlsx.
 * `novaInicial` (o `?nova=tipo:id` do "Criar tarefa" da Mesa) abre a tarefa NOVA já vinculada; `prazoInicial` (o
 * `?prazo=` do calendário de todos os quadros), a tarefa NOVA com esse prazo; `tarefaInicial`, a tarefa.
 */
export function QuadroTarefas({
  aba,
  quadro,
  listas,
  tarefas: doServidor,
  etiquetas,
  membros,
  pessoas,
  edicoes,
  automacoes,
  modelosTarefa,
  modelosQuadro,
  hoje,
  podeEditar,
  usuarioId,
  eventos = [],
  novaInicial = null,
  prazoInicial = null,
  tarefaInicial = null,
}: DadosQuadro & {
  aba: AbaQuadro;
  usuarioId: number;
  /** Os EVENTOS cadastrados das tarefas deste quadro (só com a aba Calendário aberta). */
  eventos?: EventoTarefa[];
  novaInicial?: VinculoTarefa | null;
  prazoInicial?: string | null;
  tarefaInicial?: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [tarefas, setTarefas] = useState(doServidor);
  useEffect(() => setTarefas(doServidor), [doServidor]);
  const [filtro, setFiltro] = useState<FiltroTarefas>(FILTRO_TAREFAS_PADRAO);
  const [arquivadas, setArquivadas] = useState(false);
  const [aberto, setAberto] = useState<AberturaTarefa | null>(null);
  const [ed, setEd] = useState(edicoes);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [aplicando, setAplicando] = useState(false);
  const [alturaBarra, setAlturaBarra] = useState(0);
  // Trocar de aba ou de Ativas/Arquivadas limpa a seleção (a barra só vale para o que está à vista).
  // biome-ignore lint/correctness/useExhaustiveDependencies: zera quando a aba/visão muda.
  useEffect(() => setSel(new Set()), [aba, arquivadas]);

  const ativas = useMemo(() => listas.filter((l) => !l.arquivada), [listas]);
  const doGrupo = useMemo(() => {
    const m = new Set(membros);
    return pessoas.filter((p) => m.has(p.id));
  }, [membros, pessoas]);
  const resumo = resumoQuadro(tarefas, hoje);
  const listasAtivas = useMemo(() => new Set(ativas.map((l) => l.id)), [ativas]);
  const filtradas = useMemo(() => filtrarTarefas(tarefas, filtro, { usuarioId, hoje }), [tarefas, filtro, usuarioId, hoje]);
  const noQuadro = useMemo(() => filtradas.filter((t) => !t.arquivada && listasAtivas.has(t.listaId)), [filtradas, listasAtivas]);
  const naLista = useMemo(() => filtradas.filter((t) => t.arquivada === arquivadas), [filtradas, arquivadas]);
  const nArquivadas = useMemo(() => tarefas.filter((t) => t.arquivada).length, [tarefas]);
  /** Abre o banner de uma tarefa NOVA (a lista de onde se pediu; o prazo do dia do calendário). */
  const nova = (listaId = ativas[0]?.id, prazo?: string) => listaId && setAberto({ tipo: "nova", listaId, prazo });

  // Chegada pela Mesa: `?nova=` abre a tarefa NOVA já vinculada; `?tarefa=` abre aquela tarefa — uma vez, e limpa a URL.
  // biome-ignore lint/correctness/useExhaustiveDependencies: só na chegada.
  useEffect(() => {
    if (tarefaInicial) setAberto({ tipo: "editar", id: tarefaInicial });
    else if (novaInicial && ativas[0]) setAberto({ tipo: "nova", listaId: ativas[0].id, vinculo: novaInicial });
    else if (prazoInicial && ativas[0]) setAberto({ tipo: "nova", listaId: ativas[0].id, prazo: prazoInicial });
    else return;
    router.replace(`${pathname}?aba=${aba}`, { scroll: false });
  }, []);

  const aplicarMassa = async (acao: AcaoMassaTarefas) => {
    const ids = [...sel];
    setAplicando(true);
    let alterados = 0;
    const falhas: string[] = [];
    for (let i = 0; i < ids.length; i += LOTE_MASSA) {
      try {
        const r = await chamar<{ alterados: number; falhas: { ticket: number | null; motivo: string }[] }>("/api/tarefas/massa", "POST", { ids: ids.slice(i, i + LOTE_MASSA), acao });
        alterados += r.alterados;
        for (const f of r.falhas) falhas.push(`${f.ticket != null ? rotuloTicket(f.ticket) : "?"}: ${f.motivo}`);
      } catch (e) {
        falhas.push((e as Error).message);
      }
    }
    setAplicando(false);
    setSel(new Set());
    router.refresh();
    if (falhas.length) toast.warning(`${num(alterados)} alterada(s); não foi possível: ${falhas.slice(0, 4).join("; ")}${falhas.length > 4 ? "…" : ""}`, 8000);
    else toast.success(`${num(alterados)} tarefa(s) alterada(s).`);
  };

  const exportar = () =>
    exportarTarefasXlsx(`Tarefas - ${quadro.nome}`, linhasPlanilhaTarefas(naLista, { listas, etiquetas, pessoas, hoje })).catch(() => toast.error("Não foi possível exportar."));

  const mover = async (id: number, listaId: number, indice: number) => {
    const antes = tarefas;
    const t = antes.find((x) => x.id === id);
    if (!t) return;
    const lista = cartoesDaLista(antes, listaId).filter((x) => x.id !== id);
    const pos = Math.max(0, Math.min(indice, lista.length));
    if (listaId === t.listaId && pos === cartoesDaLista(antes, listaId).findIndex((x) => x.id === id)) return; // mesmo lugar
    const viz = vizinhos(antes, id, listaId, pos);
    setTarefas(moverCartao(antes, listas, id, listaId, pos, new Date().toISOString()));
    try {
      const r = await chamar<{ ordens: [number, number][]; atualizar: boolean }>(`/api/tarefas/${id}/mover`, "POST", { listaId, ...viz });
      // A lista foi renumerada, uma automação agiu ou nasceu a próxima ocorrência de uma recorrente: recarrega.
      if (r.ordens?.length || r.atualizar) router.refresh();
    } catch (e) {
      setTarefas(antes);
      toast.error((e as Error).message);
    }
  };

  /** O mês à vista na aba Calendário e os EVENTOS dele (período, recorrência e os cadastrados deste quadro). */
  const [mesCal, setMesCal] = useState(() => ({ ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)) }));
  const eventosCal = useMemo(() => {
    if (aba !== "calendario") return [];
    const g = gradeMes(mesCal.ano, mesCal.mes);
    return eventosDoCalendario(
      noQuadro.map((t) => ({ ...t, quadroId: quadro.id })),
      eventos,
      g[0][0],
      g.at(-1)?.[6] ?? g[0][6],
    );
  }, [aba, mesCal, noQuadro, eventos, quadro.id]);
  /** ARRASTAR no calendário: o período reagenda a tarefa; o evento cadastrado muda de dia (e de hora, na grade). */
  const moverNoCalendario = async (e: EventoCalendario, dia: string, hora: string | null) => {
    if (e.tipo === "periodo") {
      const t = tarefas.find((x) => x.id === e.tarefaId);
      if (t) await reagendarTarefa(t, dia);
      return;
    }
    const ev = eventos.find((x) => x.id === e.eventoId);
    if (!ev) return;
    const dur = !ev.diaInteiro && horaValida(ev.horaInicio) && horaValida(ev.horaFim) ? minutosDe(ev.horaFim) - minutosDe(ev.horaInicio) : null;
    const comHora = hora && !ev.diaInteiro;
    try {
      await chamar(`/api/tarefas/eventos/${ev.id}`, "PATCH", {
        ...ev,
        data: dia,
        horaInicio: comHora ? hora : ev.horaInicio,
        horaFim: comHora ? (dur != null ? horaDeMinutos(Math.min(minutosDe(hora) + dur, 23 * 60 + 59)) : null) : ev.horaFim,
      });
      toast.success(`"${ev.titulo}" movido para ${dataBR(dia)}.`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  /** REAGENDAR (arrastar no calendário): o prazo vai para o dia e o início anda junto — otimista, volta se falhar. */
  const reagendarTarefa = async (t: TarefaCalendario, dia: string) => {
    const antes = tarefas;
    const novo = reagendar(t, dia);
    setTarefas(antes.map((x) => (x.id === t.id ? { ...x, ...novo } : x)));
    try {
      await chamar(`/api/tarefas/${t.id}`, "PATCH", novo);
      toast.success(`${rotuloTicket(t.ticket)} reagendada para ${dataBR(dia)}.`);
    } catch (e) {
      setTarefas(antes);
      toast.error((e as Error).message);
    }
  };

  const arquivar = async (id: number) => {
    const antes = tarefas;
    setTarefas(antes.map((t) => (t.id === id ? { ...t, arquivada: true } : t)));
    try {
      await chamar(`/api/tarefas/${id}`, "PATCH", { arquivada: true });
      toast.success("Tarefa arquivada — restaure pela aba Lista (Arquivadas).");
      router.refresh();
    } catch (e) {
      setTarefas(antes);
      toast.error((e as Error).message);
    }
  };

  const edicoesLista: EdicoesDaTabela = {
    chave: `${prefixoEdicoesTarefas(quadro.id)}lista`,
    lista: ed.lista,
    padroes: ed.padroes,
    onMudar: (lista, padroes) => setEd({ lista, padroes }),
  };

  const indicadores = [
    { rotulo: "Abertas", valor: num(resumo.abertas) },
    { rotulo: "Atrasadas", valor: num(resumo.atrasadas), cor: resumo.atrasadas ? "var(--danger)" : undefined },
    { rotulo: "Concluídas", valor: num(resumo.concluidas) },
  ];
  const semListas = ativas.length === 0;

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/painel/tarefas"
            aria-label="Voltar para Tarefas"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-text lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
          >
            <IconChevronLeft className="h-4 w-4" />
          </Link>
          <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: quadro.cor }} />
          <h1 className="min-w-0 truncate text-lg font-bold text-text" title={quadro.nome}>
            {quadro.nome}
          </h1>
          <Badge>{quadro.grupoNome}</Badge>
          {quadro.arquivado && <Badge tone="amber">Arquivado</Badge>}
        </div>
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          {indicadores.map((i) => (
            <div key={i.rotulo} className="flex items-baseline gap-1.5">
              <dt className="text-muted">{i.rotulo}</dt>
              <dd className="font-semibold tabular-nums text-text" style={i.cor ? { color: i.cor } : undefined}>
                {i.valor}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <AbasEspaco<AbaQuadro>
        aba={aba}
        opcoes={[
          { value: "quadro", label: "Quadro" },
          { value: "lista", label: "Lista" },
          { value: "calendario", label: "Calendário", curto: "Agenda" },
          { value: "dashboard", label: "Dashboard", curto: "Painel" },
          { value: "configuracao", label: "Configuração", curto: "Config." },
        ]}
      >
        {aba !== "configuracao" && (
          <FerramentasAba>
            <FiltrosTarefas filtro={filtro} onChange={setFiltro} pessoas={pessoas} etiquetas={etiquetas} usuarioId={usuarioId} />
            {aba === "lista" && (
              <>
                <SeletorFiltro
                  icone={<IconArquivar className="h-4 w-4" />}
                  rotulo="Mostrar"
                  valor={arquivadas ? "arquivadas" : "ativas"}
                  ativo={arquivadas}
                  onChange={(v) => setArquivadas(v === "arquivadas")}
                  opcoes={[
                    { valor: "ativas", rotulo: "Tarefas ativas" },
                    { valor: "arquivadas", rotulo: `Arquivadas (${num(nArquivadas)})` },
                  ]}
                />
                <Button size="sm" variant="secondary" className="max-sm:w-11 max-sm:px-0" disabled={!naLista.length} icon={<IconDownload className="h-4 w-4" />} onClick={exportar} aria-label="Exportar as tarefas em .xlsx">
                  <span className="max-sm:hidden">XLSX</span>
                </Button>
                {!arquivadas && (
                  <Button size="sm" variant="accent" className="max-sm:w-11 max-sm:px-0" disabled={semListas} icon={<IconPlus className="h-4 w-4" />} aria-label="Adicionar tarefa" onClick={() => nova()}>
                    <span className="max-sm:hidden">Adicionar tarefa</span>
                  </Button>
                )}
              </>
            )}
          </FerramentasAba>
        )}
        {aba !== "configuracao" && (
          <div className="mb-[var(--gap-block)] flex flex-wrap items-center gap-2 empty:hidden">
            <ChipsFiltrosTarefas filtro={filtro} onChange={setFiltro} pessoas={pessoas} etiquetas={etiquetas} usuarioId={usuarioId} />
            {aba === "lista" && arquivadas && (
              <span className="text-[12.5px] text-muted">Mostrando as ARQUIVADAS — restaure pelo detalhe da tarefa ou pela edição em massa.</span>
            )}
            {aba === "quadro" && nArquivadas > 0 && (
              <button
                type="button"
                onClick={() => {
                  setArquivadas(true);
                  router.push(`${pathname}?aba=lista`, { scroll: false });
                }}
                className="ml-auto min-h-11 rounded-control px-2 text-[12.5px] text-muted underline-offset-2 hover:text-text-2 hover:underline lg:min-h-[var(--h-control-sm)]"
              >
                {num(nArquivadas)} arquivada{nArquivadas === 1 ? "" : "s"} — ver na Lista
              </button>
            )}
          </div>
        )}
        {aba === "dashboard" ? (
          <DashboardTarefas
            tarefas={noQuadro}
            listas={listas}
            pessoas={pessoas}
            hoje={hoje}
            responsavel={filtro.responsavel}
            onResponsavel={(r) => setFiltro((f) => ({ ...f, responsavel: r }))}
            onAbrir={(id) => setAberto({ tipo: "editar", id })}
          />
        ) : aba === "quadro" ? (
          semListas ? (
            <p className="rounded-card border border-dashed border-border-2 bg-surface px-6 py-12 text-center text-sm text-muted">
              Nenhuma lista ativa — crie uma na Configuração do quadro.
            </p>
          ) : (
            <QuadroKanban
              listas={ativas}
              tarefas={noQuadro}
              etiquetas={etiquetas}
              pessoas={pessoas}
              hoje={hoje}
              onAbrir={(id) => setAberto({ tipo: "editar", id })}
              onMover={mover}
              onNova={(listaId) => nova(listaId)}
              onArquivar={arquivar}
            />
          )
        ) : aba === "lista" ? (
          <TabelaTarefas
            tarefas={naLista}
            listas={listas}
            etiquetas={etiquetas}
            pessoas={pessoas}
            hoje={hoje}
            ativa={aberto?.tipo === "editar" ? aberto.id : null}
            onAbrir={(id) => setAberto({ tipo: "editar", id })}
            edicoes={edicoesLista}
            selecao={sel}
            onSelecao={setSel}
            reservaInferior={alturaBarra > 0 ? alturaBarra + tokenPx("--gap-block", 12) : 0}
          />
        ) : aba === "calendario" ? (
          <CalendarioTarefas
            eventos={eventosCal}
            hoje={hoje}
            mes={mesCal}
            onMes={setMesCal}
            contadores={contadoresCalendario(noQuadro, hoje)}
            onAbrir={(e) => setAberto({ tipo: "editar", id: e.tarefaId })}
            onCriar={semListas ? undefined : (slot) => nova(undefined, slot.data)}
            onMover={moverNoCalendario}
          />
        ) : (
          <ConfiguracaoQuadro
            quadro={quadro}
            listas={listas}
            etiquetas={etiquetas}
            automacoes={automacoes}
            pessoas={doGrupo}
            modelosQuadro={modelosQuadro}
            modelosTarefa={modelosTarefa}
            usuarioId={usuarioId}
            podeEditar={podeEditar}
            onMudou={() => router.refresh()}
          />
        )}
      </AbasEspaco>

      {aba === "lista" && (sel.size > 0 || aplicando) && (
        <BarraSelecao
          fixa
          onAltura={setAlturaBarra}
          bloqueada={aplicando}
          registros={naLista.filter((t) => sel.has(t.id)).map((t) => ({ key: t.id, rotulo: `${rotuloTicket(t.ticket)} ${t.titulo}` }))}
          onRemover={(k) =>
            setSel((s) => {
              const n = new Set(s);
              n.delete(Number(k));
              return n;
            })
          }
          onLimpar={() => setSel(new Set())}
          resumo={
            <span>
              {num(sel.size)} {sel.size === 1 ? "tarefa selecionada" : "tarefas selecionadas"}
            </span>
          }
        >
          <BarraEdicaoMassaTarefas listas={ativas} pessoas={doGrupo} etiquetas={etiquetas} arquivadas={arquivadas} aplicando={aplicando} onAplicar={aplicarMassa} />
        </BarraSelecao>
      )}

      <TarefaDetalhe
        aberto={aberto}
        quadroId={quadro.id}
        tarefas={tarefas}
        listas={ativas}
        etiquetas={etiquetas}
        pessoas={doGrupo}
        todas={pessoas}
        hoje={hoje}
        usuarioId={usuarioId}
        podeExcluir={podeEditar}
        modelos={modelosTarefa}
        onFechar={() => setAberto(null)}
        onSalvo={() => router.refresh()}
      />
    </div>
  );
}
