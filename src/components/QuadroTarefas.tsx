"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { dataBR, num } from "@/lib/format";
import { exportarTarefasXlsx, linhasPlanilhaTarefas } from "@/lib/exportar-tarefas";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { DadosQuadro } from "@/lib/tarefas-dados";
import {
  cartoesDaLista,
  indiceReal,
  type ListaTarefas,
  type OrdenacaoLista,
  ROTULO_ORDENACAO,
  FILTRO_TAREFAS_PADRAO,
  type FiltroTarefas,
  filtrarTarefas,
  moverCartao,
  contadoresCalendario,
  type EventoCalendario,
  type EventoTarefa,
  eventosDoCalendario,
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
import { CHAVE_OPCOES_CALENDARIO, eventoArrastado, eventoComFim, intervaloCalendario, type FeriadoCadastro, feriadosNoIntervalo, OPCOES_CALENDARIO_PADRAO, type OpcoesCalendario } from "@/lib/calendario-core";
import { CalendarioTarefas } from "./CalendarioTarefas";
import { ConfiguracaoQuadro } from "./ConfiguracaoQuadro";
import { FundoDoQuadro } from "./FundoQuadro";
import { DashboardMesaEsqueleto } from "./DashboardMesaEsqueleto";
import type { EdicoesDaTabela } from "./DataTable";
import { ChipsFiltrosTarefas, FiltrosTarefas } from "./FiltrosTarefas";
import { tokenPx } from "./espacamento";
import { IconArquivar, IconChevronLeft, IconDownload, IconPlus } from "./icons";
import { CopiarMoverTarefa, type ModoCopia, type ResultadoCopia } from "./CopiarMoverTarefa";
import { CopiarMoverLista, ExcluirLista, MenuLista, type ModoLista } from "./MenuLista";
import { useConfirmacao } from "./Confirmacao";
import { EstrelaFavorito, useFavoritosQuadros } from "./FavoritosQuadros";
import { QuadroKanban } from "./QuadroKanban";
import { TrocarQuadro } from "./TrocarQuadro";
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
  equipes,
  campos,
  membros,
  pessoas,
  edicoes,
  automacoes,
  favoritos,
  modelosQuadro,
  hoje,
  podeEditar,
  usuarioId,
  eventos = [],
  calendario,
  novaInicial = null,
  prazoInicial = null,
  tarefaInicial = null,
}: DadosQuadro & {
  aba: AbaQuadro;
  usuarioId: number;
  /** Os EVENTOS cadastrados das tarefas deste quadro (só com a aba Calendário aberta). */
  eventos?: EventoTarefa[];
  /** As OPÇÕES da pessoa e os FERIADOS cadastrados (só com a aba Calendário aberta). */
  calendario?: { opcoes: OpcoesCalendario; feriados: FeriadoCadastro[] };
  novaInicial?: VinculoTarefa | null;
  prazoInicial?: string | null;
  tarefaInicial?: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [tarefas, setTarefas] = useState(doServidor);
  useEffect(() => setTarefas(doServidor), [doServidor]);
  const [filtro, setFiltro] = useState<FiltroTarefas>(FILTRO_TAREFAS_PADRAO);
  // A aba Lista mostra as ativas, as arquivadas ou os TEMPLATES.
  const [mostrar, setMostrar] = useState<"ativas" | "arquivadas" | "templates">("ativas");
  const arquivadas = mostrar === "arquivadas";
  const [copia, setCopia] = useState<{ modo: ModoCopia; id: number } | null>(null);
  const [copiaLista, setCopiaLista] = useState<{ modo: ModoLista; listaId: number } | null>(null);
  const [excluindoLista, setExcluindoLista] = useState<number | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();
  const favs = useFavoritosQuadros(favoritos);
  const [aberto, setAberto] = useState<AberturaTarefa | null>(null);
  const [ed, setEd] = useState(edicoes);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [aplicando, setAplicando] = useState(false);
  const [alturaBarra, setAlturaBarra] = useState(0);
  // Trocar de aba ou de Ativas/Arquivadas limpa a seleção (a barra só vale para o que está à vista).
  // biome-ignore lint/correctness/useExhaustiveDependencies: zera quando a aba/visão muda.
  useEffect(() => setSel(new Set()), [aba, mostrar]);

  const ativas = useMemo(() => listas.filter((l) => !l.arquivada), [listas]);
  const doGrupo = useMemo(() => {
    const m = new Set(membros);
    return pessoas.filter((p) => m.has(p.id));
  }, [membros, pessoas]);
  const resumo = resumoQuadro(tarefas, hoje);
  const listasAtivas = useMemo(() => new Set(ativas.map((l) => l.id)), [ativas]);
  const filtradas = useMemo(() => filtrarTarefas(tarefas, filtro, { usuarioId, hoje }), [tarefas, filtro, usuarioId, hoje]);
  const noQuadro = useMemo(() => filtradas.filter((t) => !t.arquivada && listasAtivas.has(t.listaId)), [filtradas, listasAtivas]);
  const naLista = useMemo(
    () => filtradas.filter((t) => (mostrar === "arquivadas" ? t.arquivada : !t.arquivada && t.template === (mostrar === "templates"))),
    [filtradas, mostrar],
  );
  const nArquivadas = useMemo(() => tarefas.filter((t) => t.arquivada).length, [tarefas]);
  const templates = useMemo(() => tarefas.filter((t) => t.template && !t.arquivada), [tarefas]);
  /** O TRABALHO à vista (sem os templates) — Dashboard e Calendário. */
  const trabalho = useMemo(() => noQuadro.filter((t) => !t.template), [noQuadro]);
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
    await executarMassa([...sel], acao);
    setSel(new Set());
  };

  /** A EDIÇÃO EM MASSA de VÁRIAS tarefas (a seleção da Lista e as ações da lista do Quadro), em fatias de 50. */
  const executarMassa = async (ids: number[], acao: AcaoMassaTarefas) => {
    if (!ids.length) return;
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
    router.refresh();
    if (falhas.length) toast.warning(`${num(alterados)} alterada(s); não foi possível: ${falhas.slice(0, 4).join("; ")}${falhas.length > 4 ? "…" : ""}`, 8000);
    else toast.success(`${num(alterados)} tarefa(s) alterada(s).`);
  };

  const exportar = () =>
    exportarTarefasXlsx(`Tarefas - ${quadro.nome}`, linhasPlanilhaTarefas(naLista, { listas, etiquetas, pessoas, hoje, equipes, campos })).catch(() => toast.error("Não foi possível exportar."));

  const mover = async (id: number, listaId: number, indice: number) => {
    const antes = tarefas;
    const t = antes.find((x) => x.id === id);
    if (!t) return;
    const lista = cartoesDaLista(antes, listaId).filter((x) => x.id !== id);
    // O quadro FILTRADO mostra só parte da lista: o índice solto é entre os visíveis.
    const pos = Math.max(0, Math.min(indiceReal(antes, noQuadro, id, listaId, indice), lista.length));
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

  /**
   * CONCLUI/REABRE no LUGAR (o círculo do cartão, o menu do toque e o calendário): otimista, com Desfazer; as regras
   * "ao concluir" e a próxima ocorrência da recorrente rodam no servidor (recarrega quando algo mudou).
   */
  const concluir = async (id: number) => {
    const antes = tarefas;
    const t = antes.find((x) => x.id === id);
    if (!t) return;
    const concluida = t.concluidaEm == null;
    setTarefas(antes.map((x) => (x.id === id ? { ...x, concluidaEm: concluida ? new Date().toISOString() : null } : x)));
    try {
      const r = await chamar<{ atualizar: boolean }>(`/api/tarefas/${id}`, "PATCH", { concluida });
      toast.desfazer(`${rotuloTicket(t.ticket)} ${concluida ? "concluída" : "reaberta"}.`, () => {
        chamar(`/api/tarefas/${id}`, "PATCH", { concluida: !concluida })
          .then(() => router.refresh())
          .catch((err) => toast.error((err as Error).message));
      });
      if (r.atualizar) router.refresh();
    } catch (e) {
      setTarefas(antes);
      toast.error((e as Error).message);
    }
  };

  /** O mês à vista na aba Calendário e os EVENTOS dele (período, recorrência e os cadastrados deste quadro). */
  const [mesCal, setMesCal] = useState(() => ({ ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)) }));
  /** A vista ANO pede o ano inteiro (os pontos de todos os meses). */
  const [anualCal, setAnualCal] = useState(false);
  const [opcoesCal, setOpcoesCal] = useState(calendario?.opcoes ?? OPCOES_CALENDARIO_PADRAO);
  useEffect(() => {
    if (calendario) setOpcoesCal(calendario.opcoes);
  }, [calendario]);
  /** As OPÇÕES da pessoa (o menu de vistas e ⚙) — as MESMAS do módulo Calendário, gravadas na hora. */
  const mudarOpcoesCal = (o: OpcoesCalendario) => {
    setOpcoesCal(o);
    chamar("/api/preferencias/tabela", "PUT", { chave: CHAVE_OPCOES_CALENDARIO, valor: o }).catch(() => toast.error("Não foi possível guardar as opções do calendário."));
  };
  /** O CÍRCULO do período no calendário: o MESMO concluir no lugar do cartão. */
  const concluirNoCalendario = (e: EventoCalendario) => concluir(e.tarefaId);
  const semPrazoCal = useMemo(
    () => (aba === "calendario" ? trabalho.filter((t) => !t.prazo && t.concluidaEm == null).map((t) => ({ id: t.id, quadroId: quadro.id, ticket: t.ticket, titulo: t.titulo })) : []),
    [aba, trabalho, quadro.id],
  );
  const { eventosCal, feriadosCal } = useMemo(() => {
    if (aba !== "calendario") return { eventosCal: [], feriadosCal: undefined };
    const { de, ate } = intervaloCalendario(mesCal, opcoesCal.inicioSegunda ? 1 : 0, anualCal);
    return {
      eventosCal: eventosDoCalendario(
        trabalho.map((t) => ({ ...t, quadroId: quadro.id })),
        eventos,
        de,
        ate,
        hoje,
      ),
      feriadosCal: feriadosNoIntervalo(calendario?.feriados ?? [], de, ate),
    };
  }, [aba, mesCal, anualCal, trabalho, eventos, quadro.id, hoje, opcoesCal.inicioSegunda, calendario?.feriados]);
  /** ARRASTAR no calendário: o período reagenda a tarefa; o evento cadastrado muda de dia (e de hora, na grade). */
  const moverNoCalendario = async (e: EventoCalendario, dia: string, hora: string | null) => {
    if (e.tipo === "periodo") {
      const t = tarefas.find((x) => x.id === e.tarefaId);
      if (t) await reagendarTarefa(t, dia);
      return;
    }
    const ev = eventos.find((x) => x.id === e.eventoId);
    if (!ev) return;
    try {
      // Uma OCORRÊNCIA da série move a série inteira pela mesma distância (não salta para o dia solto).
      await chamar(`/api/tarefas/eventos/${ev.id}`, "PATCH", eventoArrastado(ev, e.inicio, dia, hora));
      toast.success(`"${ev.titulo}" movido para ${dataBR(dia)}.`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  /** A BORDA arrastada: o fim do evento com hora. */
  const redimensionarNoCalendario = async (e: EventoCalendario, horaFim: string) => {
    const ev = eventos.find((x) => x.id === e.eventoId);
    if (!ev || ev.horaFim === horaFim) return;
    try {
      await chamar(`/api/tarefas/eventos/${ev.id}`, "PATCH", eventoComFim(ev, horaFim));
      toast.success(`"${ev.titulo}" agora vai até ${horaFim}.`);
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

  /** Abre a tarefa recém-criada (cópia no quadro, template) já no estado local — o resumo vem da rota; o quadro recarrega. */
  const abrirNova = async (id: number, focoTitulo: boolean) => {
    try {
      const j = await chamar<{ tarefa: DadosQuadro["tarefas"][number] }>(`/api/tarefas/${id}?contexto=tarefa`);
      setTarefas((ts) => (ts.some((t) => t.id === id) ? ts : [...ts, j.tarefa]));
      setAberto({ tipo: "editar", id, focoTitulo });
    } catch (e) {
      toast.error((e as Error).message);
    }
    router.refresh();
  };

  /** CRIAR A PARTIR DE TEMPLATE (o ícone no pé da lista): copia o template para a lista e abre com o foco no fim do título. */
  const doTemplate = async (templateId: number, listaId: number) => {
    try {
      const r = await chamar<{ id: number }>(`/api/tarefas/${templateId}/copiar`, "POST", { quadroId: quadro.id, listaId });
      await abrirNova(r.id, true);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  /** Depois de copiar/mover/criar template: a cópia NESTE quadro abre; o que foi movido para outro quadro sai daqui. */
  const aposCopia = (r: ResultadoCopia) => {
    setCopia(null);
    if (r.modo === "mover") {
      setAberto(null);
      setTarefas((ts) => ts.filter((t) => t.id !== r.id));
      router.refresh();
    } else if (r.quadroId === quadro.id) abrirNova(r.id, r.modo === "copiar");
    else router.refresh();
  };

  /** Os cartões ATIVOS (não arquivados) de uma lista, na ordem — o que as ações do menu da lista consideram. */
  const ativosDaLista = (listaId: number) => cartoesDaLista(tarefas, listaId).filter((t) => !t.arquivada);

  /** ORDENAR a lista por um critério (o servidor renumera; o quadro recarrega). */
  const ordenarLista = async (l: ListaTarefas, por: OrdenacaoLista) => {
    try {
      await chamar(`/api/tarefas/listas/${l.id}/ordenar`, "POST", { por });
      toast.success(`“${l.nome}” ordenada por ${ROTULO_ORDENACAO[por].toLowerCase()}.`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const arquivarCartoesDaLista = async (l: ListaTarefas) => {
    const ids = ativosDaLista(l.id).map((t) => t.id);
    if (!ids.length) return;
    if (!(await confirmar({ titulo: `Arquivar os ${num(ids.length)} cartões de “${l.nome}”?`, texto: "Restaure pela aba Lista (Arquivadas).", confirmar: "Arquivar" }))) return;
    await executarMassa(ids, { campo: "arquivar", arquivada: true });
  };

  const arquivarLista = async (l: ListaTarefas) => {
    if (!(await confirmar({ titulo: `Arquivar a lista “${l.nome}”?`, texto: "Ela some do quadro com os cartões; reexiba na Configuração.", confirmar: "Arquivar" }))) return;
    try {
      await chamar(`/api/tarefas/listas/${l.id}`, "PATCH", { arquivada: true });
      toast.success("Lista arquivada.");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  /** DUPLICAR o cartão (como o "Copiar cartão" do Trello): a cópia entra logo abaixo, na mesma lista — com Desfazer. */
  const duplicando = useRef(false);
  const duplicar = async (id: number) => {
    const t = tarefas.find((x) => x.id === id);
    if (!t || duplicando.current) return;
    duplicando.current = true;
    try {
      const r = await chamar<{ id: number; ticket: number }>(`/api/tarefas/${id}/copiar`, "POST", {
        quadroId: quadro.id,
        listaId: t.listaId,
        aposId: id,
        // O título AUTOMÁTICO (campos personalizados) segue automático; os demais ganham "Cópia de".
        titulo: quadro.formatoTitulo && !t.tituloManual ? undefined : `Cópia de ${t.titulo}`.slice(0, 200),
      });
      router.refresh();
      toast.desfazer(`${rotuloTicket(r.ticket)} criada — cópia de ${rotuloTicket(t.ticket)}.`, () => {
        // Excluir é do editor; os demais desfazem ARQUIVANDO a cópia.
        chamar(`/api/tarefas/${r.id}`, podeEditar ? "DELETE" : "PATCH", podeEditar ? undefined : { arquivada: true })
          .then(() => router.refresh())
          .catch((err) => toast.error((err as Error).message));
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      duplicando.current = false;
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
  /** "+ Adicionar outra lista": cria no fim do quadro (qualquer membro) e recarrega. */
  const novaLista = async (nome: string) => {
    await chamar(`/api/tarefas/quadros/${quadro.id}/listas`, "POST", { nome });
    router.refresh();
    return true;
  };

  return (
    <div className="relative isolate space-y-[var(--gap-block)]">
      <FundoDoQuadro url={quadro.fundoUrl} />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/painel/tarefas"
            aria-label="Voltar para Tarefas"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-text lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
          >
            <IconChevronLeft className="h-4 w-4" />
          </Link>
          <h1 className="min-w-0">
            <TrocarQuadro quadro={quadro} aba={aba} favoritos={favs.favoritos} />
          </h1>
          <EstrelaFavorito ativo={favs.favoritos.includes(quadro.id)} nome={quadro.nome} onAlternar={() => favs.alternar(quadro.id)} />
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
            <FiltrosTarefas filtro={filtro} onChange={setFiltro} pessoas={pessoas} etiquetas={etiquetas} campos={campos} usuarioId={usuarioId} />
            {aba === "lista" && (
              <>
                <SeletorFiltro
                  icone={<IconArquivar className="h-4 w-4" />}
                  rotulo="Mostrar"
                  valor={mostrar}
                  ativo={mostrar !== "ativas"}
                  onChange={(v) => setMostrar(v as typeof mostrar)}
                  opcoes={[
                    { valor: "ativas", rotulo: "Tarefas ativas" },
                    { valor: "templates", rotulo: `Templates (${num(templates.length)})` },
                    { valor: "arquivadas", rotulo: `Arquivadas (${num(nArquivadas)})` },
                  ]}
                />
                <Button size="sm" variant="secondary" className="max-sm:w-11 max-sm:px-0" disabled={!naLista.length} icon={<IconDownload className="h-4 w-4" />} onClick={exportar} aria-label="Exportar as tarefas em .xlsx">
                  <span className="max-sm:hidden">XLSX</span>
                </Button>
                {mostrar === "ativas" && (
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
            <ChipsFiltrosTarefas filtro={filtro} onChange={setFiltro} pessoas={pessoas} etiquetas={etiquetas} campos={campos} usuarioId={usuarioId} />
            {aba === "lista" && arquivadas && (
              <span className="text-[12.5px] text-muted">Mostrando as ARQUIVADAS — restaure pelo detalhe da tarefa ou pela edição em massa.</span>
            )}
            {aba === "quadro" && nArquivadas > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMostrar("arquivadas");
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
            tarefas={trabalho}
            listas={listas}
            pessoas={pessoas}
            hoje={hoje}
            responsavel={filtro.responsaveis.length === 1 ? filtro.responsaveis[0] : "todos"}
            onResponsavel={(r) => setFiltro((f) => ({ ...f, responsaveis: r === "todos" ? [] : [r] }))}
            onAbrir={(id) => setAberto({ tipo: "editar", id })}
          />
        ) : aba === "quadro" ? (
          semListas && quadro.arquivado ? (
            <p className="rounded-card border border-dashed border-border-2 bg-surface px-6 py-12 text-center text-sm text-muted">
              Nenhuma lista ativa — o quadro está arquivado.
            </p>
          ) : (
            <QuadroKanban
              onNovaLista={quadro.arquivado ? undefined : novaLista}
              listas={ativas}
              tarefas={noQuadro}
              etiquetas={etiquetas}
              campos={campos}
              pessoas={pessoas}
              hoje={hoje}
              onAbrir={(id) => setAberto({ tipo: "editar", id })}
              onMover={mover}
              onNova={(listaId) => nova(listaId)}
              onArquivar={arquivar}
              onConcluir={concluir}
              onDuplicar={quadro.arquivado ? undefined : duplicar}
              templates={templates}
              onDoTemplate={doTemplate}
              onCopiarMover={(id, modo) => setCopia({ id, modo })}
              menuLista={(l) => (
                <MenuLista
                  lista={l}
                  outras={ativas.filter((x) => x.id !== l.id)}
                  qtd={ativosDaLista(l.id).length}
                  podeEditar={podeEditar && !quadro.arquivado}
                  disabled={aplicando}
                  onNova={() => nova(l.id)}
                  onOrdenar={(por) => ordenarLista(l, por)}
                  onMoverCartoes={(dest) => executarMassa(ativosDaLista(l.id).map((t) => t.id), { campo: "lista", listaId: dest })}
                  onArquivarCartoes={() => arquivarCartoesDaLista(l)}
                  onCopiarMover={(modo) => setCopiaLista({ modo, listaId: l.id })}
                  onArquivarLista={() => arquivarLista(l)}
                  onExcluirLista={() => setExcluindoLista(l.id)}
                />
              )}
            />
          )
        ) : aba === "lista" ? (
          <TabelaTarefas
            tarefas={naLista}
            listas={listas}
            etiquetas={etiquetas}
            equipes={equipes}
            campos={campos}
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
            onAno={setAnualCal}
            contadores={contadoresCalendario(trabalho, hoje, opcoesCal.inicioSegunda ? 1 : 0)}
            onAbrir={(e) => setAberto({ tipo: "editar", id: e.tarefaId })}
            onCriar={semListas ? undefined : (slot) => nova(undefined, slot.data)}
            onMover={moverNoCalendario}
            onRedimensionar={redimensionarNoCalendario}
            onConcluir={concluirNoCalendario}
            opcoes={opcoesCal}
            onOpcoes={mudarOpcoesCal}
            feriados={feriadosCal}
            semPrazo={semPrazoCal}
            onAbrirTarefa={(id) => setAberto({ tipo: "editar", id })}
          />
        ) : (
          <ConfiguracaoQuadro
            quadro={quadro}
            listas={listas}
            etiquetas={etiquetas}
            equipes={equipes}
            campos={campos}
            automacoes={automacoes}
            pessoas={doGrupo}
            todas={pessoas}
            modelosQuadro={modelosQuadro}
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
          <BarraEdicaoMassaTarefas listas={ativas} pessoas={doGrupo} etiquetas={etiquetas} equipes={equipes} arquivadas={arquivadas} aplicando={aplicando} onAplicar={aplicarMassa} />
        </BarraSelecao>
      )}

      <TarefaDetalhe
        aberto={aberto}
        quadroId={quadro.id}
        tarefas={tarefas}
        listas={ativas}
        etiquetas={etiquetas}
        equipes={equipes}
        campos={campos}
        formatoTitulo={quadro.formatoTitulo}
        pessoas={doGrupo}
        todas={pessoas}
        hoje={hoje}
        usuarioId={usuarioId}
        podeExcluir={podeEditar}
        onCopiarMover={(id, modo) => setCopia({ id, modo })}
        onDuplicar={quadro.arquivado ? undefined : duplicar}
        onFechar={() => setAberto(null)}
        onSalvo={() => router.refresh()}
      />
      <CopiarMoverTarefa
        aberto={(() => {
          const t = copia && tarefas.find((x) => x.id === copia.id);
          return copia && t ? { modo: copia.modo, tarefa: t, quadroId: quadro.id } : null;
        })()}
        onFechar={() => setCopia(null)}
        onFeito={aposCopia}
      />
      <CopiarMoverLista
        aberto={(() => {
          const l = copiaLista && listas.find((x) => x.id === copiaLista.listaId);
          return copiaLista && l ? { modo: copiaLista.modo, lista: l, cartoes: tarefas.filter((t) => t.listaId === l.id) } : null;
        })()}
        quadroId={quadro.id}
        onFechar={() => setCopiaLista(null)}
        onFeito={() => {
          setCopiaLista(null);
          router.refresh();
        }}
      />
      <ExcluirLista
        lista={listas.find((x) => x.id === excluindoLista) ?? null}
        outras={ativas.filter((x) => x.id !== excluindoLista)}
        onFechar={() => setExcluindoLista(null)}
        onFeito={() => {
          setExcluindoLista(null);
          router.refresh();
        }}
      />
      {confirmacao}
    </div>
  );
}
