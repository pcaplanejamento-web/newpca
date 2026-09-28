"use client";

import { Fragment, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import type { ChecklistNomeado, ComentarioTarefa, ItemChecklist } from "@/lib/tarefas";
import {
  type DadosEvento,
  type EventoTarefa,
  adicionarBloco,
  type BlocoTarefa,
  blocosDaTarefa,
  blocosDisponiveis,
  blocosParaGravar,
  blocoTemDado,
  type DadosBlocos,
  metadadoTemDado,
  TIPOS_METADADO,
  ROTULO_METADADO,
  type TipoMetadado,
  type CampoTarefa,
  montarTitulo,
  estadoPrazo,
  horaAgoraBrasilia,
  rotuloData,
  COR_ESTADO_PRAZO,
  ROTULO_ESTADO_PRAZO,
  rotuloRecorrencia,
  type EquipeQuadro,
  MAX_NOTA,
  MAX_TITULO_LINK,
  MAX_URL,
  moverBloco,
  removerBloco,
  ROTULO_BLOCO,
  urlValida,
  COR_PRIORIDADE,
  type EtiquetaTarefa,
  linkTarefa,
  type ListaTarefas,
  type Prioridade,
  PRIORIDADES,
  ROTULO_PRIORIDADE,
  rotuloTicket,
  type Recorrencia,
  type TarefaResumo,
  type VinculoTarefa as Vinculo,
} from "@/lib/tarefas-core";
import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { CamposDaTarefa } from "./CamposTarefa";
import { ChipPreso, GuiaBloco, ICONE_METADADO, MenuAdicionarCartao, MolduraBloco, useArrastoBlocos } from "./BlocosTarefa";
import { CirculoConcluir } from "./CirculoConcluir";
import { CampoTextoFormatado } from "./TextoFormatado";
import { acoesChecklistRascunho, type ChecklistRascunho, ChecklistTarefa, useChecklistServidor } from "./ChecklistTarefa";
import { AtividadeTarefa } from "./AtividadeTarefa";
import { useConfirmacao } from "./Confirmacao";
import { ehDesktop } from "./espacamento";
import { SelectField, TextField } from "./Field";
import { useHistorico } from "./Historico";
import { LinkExterno } from "./LinkExterno";
import type { ModoCopia } from "./CopiarMoverTarefa";
import { Dropdown } from "./Dropdown";
import { IconArquivar, IconArrowRight, IconBandeira, IconCheck, IconComentario, IconCopy, IconDesarquivar, IconLink, IconMais, IconModelo, IconTrash } from "./icons";
import { EventosTarefa } from "./EventosTarefa";
import { DatasTarefa } from "./DatasTarefa";
import { Modal, type ModalPainel } from "./Modal";
import { RecorrenciaTarefa } from "./RecorrenciaTarefa";
import { Segmented } from "./Segmented";
import { SeletorEtiquetas } from "./SeletorEtiquetas";
import { SeletorPessoas } from "./SeletorPessoas";
import { toast } from "./Toast";
import { VinculosTarefa } from "./VinculosTarefa";

/**
 * Qual detalhe está aberto: uma tarefa NOVA (na lista dada; `vinculo` = já ligada — "Criar tarefa" da Mesa; `prazo` = o
 * dia do calendário) ou uma existente.
 */
export type AberturaTarefa =
  | { tipo: "nova"; listaId: number; vinculo?: Vinculo | null; prazo?: string }
  | { tipo: "editar"; id: number; focoTitulo?: boolean };

type Rascunho = {
  titulo: string;
  listaId: number;
  prioridade: Prioridade;
  inicio: string;
  prazo: string;
  /** "HH:MM" (vazio = o dia inteiro). */
  prazoHora: string;
  lembreteMin: number | null;
  estimativa: string;
  pessoas: number[];
  observadores: number[];
  equipes: number[];
  etiquetas: number[];
  vinculos: Vinculo[];
  descricao: string;
  recorrencia: Recorrencia | null;
  /** Os checklists da tarefa NOVA (nome + textos — vão junto no POST). */
  checklists: ChecklistRascunho[];
  /** Os EVENTOS da tarefa NOVA (vão junto no POST; na gravada, gravam na hora). */
  eventos: DadosEvento[];
  /** Os BLOCOS do corpo, na ordem. */
  blocos: BlocoTarefa[];
  /** Os valores dos CAMPOS personalizados (id → valor). */
  campos: Record<number, string>;
  /** O título foi escrito à mão (o automático não o troca). */
  tituloManual: boolean;
};
type Conteudo = { checklists: ChecklistNomeado[]; checklist: ItemChecklist[]; comentarios: ComentarioTarefa[]; eventos: EventoTarefa[] };

const iguais = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));
const chavesVinculos = (l: Vinculo[]) => l.map((v) => `${v.tipo}:${v.id}`).join("|");
const numEstimativa = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

/** O que decide se um bloco do corpo tem dado — a partir do rascunho. */
const dadosDoRascunho = (r: Omit<Rascunho, "blocos">, checklist: number, eventos: number): DadosBlocos => ({ vinculos: r.vinculos.length, checklist, eventos });

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[13.5px] font-bold text-text">{titulo}</p>
      {children}
    </div>
  );
}

/**
 * DETALHE de uma tarefa (criar e editar) num banner — a distribuição do TRELLO: o CÍRCULO de concluir + o TÍTULO no
 * lugar, a lista, a fileira **+ Adicionar** (`MenuAdicionarCartao`), a FAIXA DE METADADOS (Membros · Etiquetas · Datas ·
 * Prioridade · Estimativa — aparecem quando têm dado ou foram acrescentadas; tocar abre o editor logo abaixo), a
 * DESCRIÇÃO formatada (lida formatada, editada no lugar) e os BLOCOS do corpo (Checklists · Notas · Links · Eventos ·
 * Vínculo — alça e ↑/↓ reordenam). "Salvar" manda SÓ o que mudou; o CHECKLIST da tarefa gravada grava na hora (otimista,
 * em fila). No painel da direita, **Comentários e atividade** num fluxo só (`AtividadeTarefa`). O menu "…" do cabeçalho: Copiar · Mover para outro quadro
 * · Criar template (`onCopiarMover` — o diálogo é do host) · Copiar link. Arquivar/restaurar (qualquer pessoa do grupo) e
 * excluir (editores). O TEMPLATE não se conclui. Fechar com alterações pede confirmação.
 */
export function TarefaDetalhe({
  aberto,
  quadroId,
  tarefas,
  listas,
  etiquetas,
  equipes = [],
  campos = [],
  formatoTitulo = null,
  pessoas,
  todas,
  hoje,
  usuarioId,
  podeExcluir,
  onCopiarMover,
  onDuplicar,
  onFechar,
  onSalvo,
  esquerda,
}: {
  aberto: AberturaTarefa | null;
  quadroId: number;
  tarefas: TarefaResumo[];
  /** As listas ATIVAS (destinos possíveis). */
  listas: ListaTarefas[];
  etiquetas: EtiquetaTarefa[];
  /** As EQUIPES do quadro (os membros de cada uma passam a ser da tarefa). */
  equipes?: EquipeQuadro[];
  /** Os CAMPOS personalizados do quadro. */
  campos?: CampoTarefa[];
  /** O formato do TÍTULO AUTOMÁTICO do quadro (null = desligado). */
  formatoTitulo?: string | null;
  /** As pessoas do GRUPO (podem ser escolhidas). */
  pessoas: Pessoa[];
  /** Todas as conhecidas (as designadas fora do grupo seguem visíveis). */
  todas: Pessoa[];
  hoje: string;
  usuarioId: number;
  /** Editor (admin/gestor): exclui a tarefa e modera comentários. */
  podeExcluir: boolean;
  /** Copiar · Mover para outro quadro · Criar template (o host abre o diálogo). */
  onCopiarMover?: (id: number, modo: ModoCopia) => void;
  /** DUPLICA a tarefa logo abaixo, na mesma lista. */
  onDuplicar?: (id: number) => void;
  onFechar: () => void;
  /** Algo foi gravado — o quadro recarrega (contagens do cartão). */
  onSalvo: () => void;
  /** Painéis À ESQUERDA do banner (ex.: o evento do Calendário que abriu a tarefa) — o banner da tarefa fica por cima no
   * celular e o Esc volta a eles. */
  esquerda?: ModalPainel[];
}) {
  const existente = aberto?.tipo === "editar" ? tarefas.find((t) => t.id === aberto.id) : undefined;
  const idAberto = aberto?.tipo === "editar" ? aberto.id : null;
  const [inicial, setInicial] = useState<Rascunho | null>(null);
  const [r, setR] = useState<Rascunho | null>(null);
  const [conteudo, setConteudo] = useState<Conteudo | null>(null);
  const [salvando, setSalvando] = useState<null | "salvar" | "arquivar" | "excluir">(null);
  const [gravandoEvento, setGravandoEvento] = useState(false);
  const [atividade, setAtividade] = useState(false);
  // Desktop: a Atividade é um banner AO LADO; no celular (um banner por vez), uma aba "Tarefa | Atividade" no próprio corpo.
  const [desk, setDesk] = useState(true);
  // Os DETALHES (histórico) no fluxo de atividade — o histórico só é buscado com eles à vista.
  const [detalhesHist, setDetalhesHist] = useState(false);
  const [versaoHist, setVersaoHist] = useState(0);
  // Os METADADOS acrescentados pelo "+ Adicionar" (ainda sem dado) e o que tem o EDITOR aberto.
  const [metaExtras, setMetaExtras] = useState<TipoMetadado[]>([]);
  const [metaEditando, setMetaEditando] = useState<TipoMetadado | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();
  const pedido = useRef(0);
  const historico = useHistorico(atividade && detalhesHist && idAberto ? `/api/tarefas/${idAberto}/historico?v=${versaoHist}` : null);

  /** O conteúdo da tarefa aberta (descrição + blocos + checklist + comentários). Só a resposta MAIS RECENTE vale. */
  const carregar = useCallback(async (id: number, primeira: boolean) => {
    const n = ++pedido.current;
    try {
      const j = await chamar<{ tarefa: { descricao: string | null; blocos: BlocoTarefa[] | null } } & Conteudo>(`/api/tarefas/${id}`);
      if (n !== pedido.current) return;
      setConteudo({ checklists: j.checklists, checklist: j.checklist, comentarios: j.comentarios, eventos: j.eventos });
      if (primeira) {
        const descricao = j.tarefa.descricao ?? "";
        const comBlocos = (x: Rascunho | null) => (x ? { ...x, descricao, blocos: blocosDaTarefa(j.tarefa.blocos, dadosDoRascunho(x, j.checklist.length, j.eventos.length)) } : x);
        setR(comBlocos);
        setInicial(comBlocos);
      }
    } catch (e) {
      if (n === pedido.current) toast.error((e as Error).message);
    }
  }, []);

  // Abre: monta o rascunho (a descrição e o conteúdo de uma existente chegam pela rota — o quadro traz só o resumo).
  // biome-ignore lint/correctness/useExhaustiveDependencies: reinicia só quando OUTRO detalhe abre.
  useEffect(() => {
    pedido.current++;
    setConteudo(null);
    if (!aberto) {
      setR(null);
      setInicial(null);
      return;
    }
    const base: Rascunho = existente
      ? {
          titulo: existente.titulo,
          listaId: existente.listaId,
          prioridade: existente.prioridade,
          inicio: existente.inicio ?? "",
          prazo: existente.prazo ?? "",
          prazoHora: existente.prazoHora ?? "",
          lembreteMin: existente.lembreteMin,
          estimativa: existente.estimativaH == null ? "" : String(existente.estimativaH).replace(".", ","),
          pessoas: existente.pessoas,
          observadores: existente.observadores,
          equipes: existente.equipes,
          etiquetas: existente.etiquetas,
          vinculos: existente.vinculos,
          descricao: "",
          recorrencia: existente.recorrencia,
          checklists: [],
          eventos: [],
          blocos: [],
          campos: existente.campos ?? {},
          tituloManual: !!existente.tituloManual,
        }
      : {
          titulo: "",
          listaId: aberto.tipo === "nova" ? aberto.listaId : (listas[0]?.id ?? 0),
          prioridade: "media",
          inicio: "",
          prazo: aberto.tipo === "nova" ? (aberto.prazo ?? "") : "",
          prazoHora: "",
          lembreteMin: null,
          estimativa: "",
          pessoas: [],
          observadores: [],
          equipes: [],
          etiquetas: [],
          vinculos: aberto.tipo === "nova" && aberto.vinculo ? [aberto.vinculo] : [],
          descricao: "",
          recorrencia: null,
          checklists: [],
          eventos: [],
          blocos: [],
          campos: {},
          tituloManual: false,
        };
    base.blocos = blocosDaTarefa(existente ? null : [], dadosDoRascunho(base, existente?.checklist.total ?? 0, existente?.eventos ?? 0));
    setR(base);
    setInicial(base);
    setDesk(ehDesktop());
    setAtividade(aberto.tipo === "editar" && ehDesktop());
    setMetaExtras([]);
    setMetaEditando(null);
    if (aberto.tipo === "editar") carregar(aberto.id, true);
  }, [aberto?.tipo, idAberto, aberto?.tipo === "nova" ? aberto.listaId : null]);

  // Os checklists gravados como o hook os pede — o MESMO objeto enquanto o conteúdo não muda (senão o hook recomeçaria).
  const checklistsGravados = useMemo(() => (conteudo ? { checklists: conteudo.checklists, itens: conteudo.checklist } : null), [conteudo]);
  const checklistServidor = useChecklistServidor(idAberto ? `/api/tarefas/${idAberto}` : null, checklistsGravados, onSalvo);
  const listaBlocos = useRef<HTMLDivElement>(null);
  const soltarBloco = (carga: { id: string }, indice: number) => setR((x) => (x ? { ...x, blocos: moverBloco(x.blocos, carga.id, indice) } : x));
  const arrastoBlocos = useArrastoBlocos(listaBlocos, soltarBloco);

  if (!aberto || !r || !inicial) return <>{confirmacao}</>;
  const nova = aberto.tipo === "nova";
  const sujo = JSON.stringify(r) !== JSON.stringify(inicial);
  const datasOk = !r.inicio || !r.prazo || r.inicio <= r.prazo;
  const est = numEstimativa(r.estimativa);
  const estOk = est == null || (Number.isFinite(est) && est >= 0 && est <= 9999);
  const carregando = !nova && !conteudo;
  const linksOk = r.blocos.every((b) => b.tipo !== "link" || !b.url.trim() || urlValida(b.url));
  const pode = r.titulo.trim().length > 0 && datasOk && estOk && linksOk && !salvando && !carregando;
  const concluida = existente?.concluidaEm != null;
  const fora = todas.filter((p) => !pessoas.some((x) => x.id === p.id));
  // Quem entra na tarefa PELAS EQUIPES escolhidas (além dos responsáveis) — só leitura.
  const pelaEquipe = [...new Set(equipes.filter((e) => r.equipes.includes(e.id)).flatMap((e) => e.membros))]
    .filter((id) => !r.pessoas.includes(id))
    .map((id) => todas.find((p) => p.id === id))
    .filter((p): p is Pessoa => !!p);
  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((x) => (x ? { ...x, [k]: v } : x));
  /** O título que o formato do quadro dá aos valores (vazio = nenhum). */
  const automatico = (valores: Record<number, string>) => (formatoTitulo ? montarTitulo(formatoTitulo, campos, valores) : "");
  /** Um CAMPO muda: com o título automático (não manual), o título acompanha. */
  const setCampo = (id: number, v: string | null) =>
    setR((x) => {
      if (!x) return x;
      const valores = { ...x.campos };
      if (v == null) delete valores[id];
      else valores[id] = v;
      const t = x.tituloManual ? "" : automatico(valores);
      return { ...x, campos: valores, titulo: t || x.titulo };
    });
  const setTitulo = (v: string) => setR((x) => (x ? { ...x, titulo: v, tituloManual: x.tituloManual || !!formatoTitulo } : x));
  const voltarAoAutomatico = () => setR((x) => (x ? { ...x, tituloManual: false, titulo: automatico(x.campos) || x.titulo } : x));

  /** CONVERTE um item do checklist numa TAREFA (na mesma lista; o texto vira o título, com o prazo e o responsável dele). */
  const converterItem = async (i: ItemChecklist) => {
    if (!idAberto) return;
    try {
      const j = await chamar<{ ticket: number }>(`/api/tarefas/${idAberto}/checklist/${i.id}/converter`, "POST");
      toast.success(`Item convertido na tarefa ${rotuloTicket(j.ticket)}.`);
      await carregar(idAberto, false);
      onSalvo();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  /** Uma gravação IMEDIATA de um comentário: o aviso de erro, e o conteúdo + o quadro recarregados. */
  const agir = async (fn: () => Promise<unknown>): Promise<boolean> => {
    if (!idAberto) return false;
    try {
      await fn();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      await carregar(idAberto, false);
      setVersaoHist((v) => v + 1);
      onSalvo();
    }
  };
  const base = `/api/tarefas/${idAberto}`;

  const fechar = async () => {
    if (salvando) return;
    if (sujo && !(await confirmar({ titulo: "Descartar as alterações?", texto: "O que foi mudado nesta tarefa não será salvo.", confirmar: "Descartar", perigo: true })))
      return;
    onFechar();
  };

  /** Grava; `concluir` = também conclui/reabre NO LUGAR (o mesmo PATCH do cartão: automações e recorrência). */
  const salvar = async (concluir?: boolean) => {
    if (!pode) return;
    setSalvando("salvar");
    try {
      if (nova) {
        await chamar("/api/tarefas", "POST", {
          quadroId,
          listaId: r.listaId,
          titulo: r.titulo.trim(),
          descricao: r.descricao.trim() || null,
          prioridade: r.prioridade,
          inicio: r.inicio || null,
          prazo: r.prazo || null,
          prazoHora: r.prazo && r.prazoHora ? r.prazoHora : null,
          lembreteMin: r.prazo ? r.lembreteMin : null,
          estimativaH: est,
          pessoas: r.pessoas,
          observadores: r.observadores,
          equipes: r.equipes,
          etiquetas: r.etiquetas,
          vinculos: r.vinculos.map((v) => ({ tipo: v.tipo, id: v.id })),
          recorrencia: r.recorrencia,
          checklists: r.checklists.map((c) => ({ nome: c.nome.trim() || "Checklist", itens: c.itens.map((t) => t.trim()).filter(Boolean) })),
          eventos: r.eventos,
          blocos: blocosParaGravar(r.blocos),
          campos: Object.entries(r.campos).map(([c, v]) => ({ campoId: Number(c), valor: v })),
          tituloManual: r.tituloManual,
        });
        toast.success("Tarefa criada.");
      } else if (existente) {
        const d: Record<string, unknown> = {};
        if (r.titulo.trim() !== inicial.titulo) d.titulo = r.titulo.trim();
        if (r.listaId !== inicial.listaId) d.listaId = r.listaId;
        if (concluir !== undefined) d.concluida = concluir;
        if (r.prioridade !== inicial.prioridade) d.prioridade = r.prioridade;
        if (r.inicio !== inicial.inicio) d.inicio = r.inicio || null;
        if (r.prazo !== inicial.prazo) d.prazo = r.prazo || null;
        if (r.prazo && r.prazoHora !== inicial.prazoHora) d.prazoHora = r.prazoHora || null;
        if (r.prazo && r.lembreteMin !== inicial.lembreteMin) d.lembreteMin = r.lembreteMin;
        if (r.estimativa !== inicial.estimativa) d.estimativaH = est;
        if (!iguais(r.pessoas, inicial.pessoas)) d.pessoas = r.pessoas;
        if (!iguais(r.observadores, inicial.observadores)) d.observadores = r.observadores;
        if (!iguais(r.etiquetas, inicial.etiquetas)) d.etiquetas = r.etiquetas;
        if (!iguais(r.equipes, inicial.equipes)) d.equipes = r.equipes;
        if (chavesVinculos(r.vinculos) !== chavesVinculos(inicial.vinculos)) d.vinculos = r.vinculos.map((v) => ({ tipo: v.tipo, id: v.id }));
        if (r.descricao !== inicial.descricao) d.descricao = r.descricao.trim() || null;
        if (JSON.stringify(r.recorrencia) !== JSON.stringify(inicial.recorrencia)) d.recorrencia = r.recorrencia;
        if (JSON.stringify(r.blocos) !== JSON.stringify(inicial.blocos)) d.blocos = blocosParaGravar(r.blocos);
        const mudouCampos = [...new Set([...Object.keys(r.campos), ...Object.keys(inicial.campos)])]
          .map(Number)
          .filter((c) => (r.campos[c] ?? null) !== (inicial.campos[c] ?? null))
          .map((c) => ({ campoId: c, valor: r.campos[c] ?? null }));
        if (mudouCampos.length) d.campos = mudouCampos;
        if (r.tituloManual !== inicial.tituloManual) d.tituloManual = r.tituloManual;
        if (Object.keys(d).length) await chamar(`/api/tarefas/${existente.id}`, "PATCH", d);
        toast.success(concluir == null ? "Tarefa salva." : concluir ? "Tarefa concluída." : "Tarefa reaberta.");
      }
      onSalvo();
      onFechar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(null);
    }
  };

  const arquivar = async () => {
    if (!existente) return;
    setSalvando("arquivar");
    try {
      await chamar(`/api/tarefas/${existente.id}`, "PATCH", { arquivada: !existente.arquivada });
      toast.success(existente.arquivada ? "Tarefa restaurada." : "Tarefa arquivada — restaure pela aba Lista (Arquivadas).");
      onSalvo();
      onFechar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(null);
    }
  };

  const excluir = async () => {
    if (!existente) return;
    const ok = await confirmar({
      titulo: `Excluir a tarefa ${rotuloTicket(existente.ticket)}?`,
      texto: "Checklist, notas e comentários vão junto. Esta ação não pode ser desfeita — no dia a dia, prefira arquivar.",
      confirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    setSalvando("excluir");
    try {
      await chamar(`/api/tarefas/${existente.id}`, "DELETE");
      toast.success("Tarefa excluída.");
      onSalvo();
      onFechar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(null);
    }
  };

  const acoesChecklist = nova ? acoesChecklistRascunho(r.checklists, (v) => set("checklists", v)) : checklistServidor;
  const nChecklist = acoesChecklist?.itens.length ?? existente?.checklist.total ?? 0;
  const eventosVisiveis = nova ? r.eventos.map((e, i) => ({ ...e, id: i + 1, convidados: e.convidados.map((u) => ({ usuarioId: u, resposta: "pendente" as const })) })) : (conteudo?.eventos ?? []);
  const nEventos = nova ? r.eventos.length : (conteudo?.eventos.length ?? existente?.eventos ?? 0);
  /** Grava UM evento: na tarefa nova, no rascunho; na gravada, na hora (e recarrega o conteúdo). */
  const salvarEvento = async (id: number | null, d: DadosEvento): Promise<boolean> => {
    if (nova) {
      setR((x) => (x ? { ...x, eventos: id == null ? [...x.eventos, d] : x.eventos.map((e, i) => (i === id - 1 ? d : e)) } : x));
      return true;
    }
    setGravandoEvento(true);
    const okGravou = await agir(() => (id == null ? chamar(`${base}/eventos`, "POST", d) : chamar(`/api/tarefas/eventos/${id}`, "PATCH", d)));
    setGravandoEvento(false);
    return okGravou;
  };
  const excluirEventoDaTarefa = async (e: { id: number; titulo: string; recorrencia?: unknown }) => {
    if (nova) return setR((x) => (x ? { ...x, eventos: x.eventos.filter((_, i) => i !== e.id - 1) } : x));
    const pergunta = e.recorrencia
      ? { titulo: `Excluir TODA a série "${e.titulo}"?`, texto: "O evento se repete — todas as ocorrências saem do calendário.", confirmar: "Excluir a série", perigo: true }
      : { titulo: `Excluir o evento "${e.titulo}"?`, confirmar: "Excluir", perigo: true };
    if (await confirmar(pergunta)) agir(() => chamar(`/api/tarefas/eventos/${e.id}`, "DELETE"));
  };
  const setBlocos = (fn: (l: BlocoTarefa[]) => BlocoTarefa[]) => setR((x) => (x ? { ...x, blocos: fn(x.blocos) } : x));
  const setBloco = (id: string, patch: Partial<{ texto: string; url: string; titulo: string }>) =>
    setBlocos((l) => l.map((b) => (b.id === id ? ({ ...b, ...patch } as BlocoTarefa) : b)));

  /** REMOVER um bloco: o de campo limpa o campo (com dado, pede confirmação; o checklist gravado exclui os itens). */
  const tirarBloco = async (b: BlocoTarefa) => {
    const temDado =
      b.tipo === "nota" ? b.texto.trim() !== "" : b.tipo === "link" ? b.url.trim() !== "" : blocoTemDado(b.tipo, dadosDoRascunho(r, nChecklist, nEventos));
    if (temDado) {
      const texto =
        b.tipo === "checklist" && !nova
          ? `Os checklists e os ${nChecklist} itens deles serão excluídos agora.`
          : b.tipo === "eventos" && !nova
            ? `Os ${nEventos} eventos serão excluídos agora.`
          : b.tipo === "nota" || b.tipo === "link"
            ? "O conteúdo sai da tarefa ao salvar."
            : "O vínculo sai da tarefa ao salvar.";
      if (!(await confirmar({ titulo: `Remover o bloco ${ROTULO_BLOCO[b.tipo]}?`, texto, confirmar: "Remover", perigo: true }))) return;
    }
    if (b.tipo === "checklist" && !nova) for (const c of acoesChecklist?.checklists ?? []) acoesChecklist?.removerChecklist(c.id);
    if (b.tipo === "eventos" && !nova) for (const e of conteudo?.eventos ?? []) await agir(() => chamar(`/api/tarefas/eventos/${e.id}`, "DELETE"));
    setR((x) => {
      if (!x) return x;
      const y = { ...x, blocos: removerBloco(x.blocos, b.id) };
      if (b.tipo === "vinculo") y.vinculos = [];
      else if (b.tipo === "checklist") y.checklists = [];
      else if (b.tipo === "eventos") y.eventos = [];
      return y;
    });
  };

  /** O CONTEÚDO de cada bloco — os mesmos campos de sempre. */
  const conteudoBloco = (b: BlocoTarefa): ReactNode => {
    switch (b.tipo) {
      case "nota":
        return (
          <CampoTextoFormatado
            valor={b.texto}
            onChange={(texto) => setBloco(b.id, { texto })}
            rotulo="Nota"
            vazio="Escreva a nota…"
            maxLength={MAX_NOTA}
            iniciarEditando={!b.texto.trim()}
          />
        );
      case "link": {
        const erro = b.url.trim() && !urlValida(b.url) ? "Informe um endereço http(s)." : undefined;
        return (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="Endereço" type="url" inputMode="url" value={b.url} maxLength={MAX_URL} placeholder="https://" error={erro} onChange={(e) => setBloco(b.id, { url: e.target.value })} />
              <TextField label="Título (opcional)" value={b.titulo} maxLength={MAX_TITULO_LINK} onChange={(e) => setBloco(b.id, { titulo: e.target.value })} />
            </div>
            {urlValida(b.url) && (
              <LinkExterno variante="texto" href={b.url.trim()} className="inline-flex min-h-11 items-center break-all text-[13px] lg:min-h-0">
                {b.titulo.trim() || b.url.trim()}
              </LinkExterno>
            )}
          </div>
        );
      }
      case "checklist":
        return acoesChecklist ? (
          <ChecklistTarefa
            acoes={acoesChecklist}
            pessoas={pessoas}
            hoje={hoje}
            rascunho={nova}
            onRemover={nova ? undefined : (i) => confirmar({ titulo: `Remover "${i.texto}" do checklist?`, confirmar: "Remover", perigo: true })}
            onRemoverChecklist={(c, n) => confirmar({ titulo: `Excluir o checklist "${c.nome}"?`, texto: `Os ${n} itens dele saem junto.`, confirmar: "Excluir", perigo: true })}
            onConverter={nova ? undefined : converterItem}
          />
        ) : (
          <p className="text-[12.5px] text-muted">Carregando…</p>
        );
      case "vinculo":
        return <VinculosTarefa valor={r.vinculos} onChange={(v) => set("vinculos", v)} tarefaId={idAberto} hoje={hoje} />;
      case "eventos":
        return carregando ? (
          <p className="text-[12.5px] text-muted">Carregando…</p>
        ) : (
          <EventosTarefa
            eventos={eventosVisiveis}
            hoje={hoje}
            onSalvar={salvarEvento}
            onExcluir={excluirEventoDaTarefa}
            ocupado={gravandoEvento}
            pessoas={nova ? undefined : pessoas}
            usuarioId={usuarioId}
          />
        );
    }
  };
  const arrasto = arrastoBlocos.arrasto;
  const movendo = arrasto?.carga.id ?? null;
  const nComentarios = conteudo?.comentarios.length ?? existente?.comentarios ?? 0;
  const listaAtual = listas.find((l) => l.id === r.listaId);

  // ── A FAIXA DE METADADOS (como no Trello) ──
  const dadosMeta = {
    pessoas: r.pessoas,
    observadores: r.observadores,
    equipes: r.equipes,
    etiquetas: r.etiquetas,
    inicio: r.inicio || null,
    prazo: r.prazo || null,
    recorrencia: r.recorrencia,
    prioridade: r.prioridade,
    estimativaH: r.estimativa.trim() ? 1 : null,
  };
  const metaVisiveis = TIPOS_METADADO.filter((t) => metaExtras.includes(t) || metadadoTemDado(t, dadosMeta));
  const alternarEditor = (t: TipoMetadado) => setMetaEditando((m) => (m === t ? null : t));
  const estadoDatas = estadoPrazo(r.prazo || null, hoje, concluida, r.prazoHora || null, horaAgoraBrasilia());
  /** O botão de um metadado na faixa (tocar abre o editor logo abaixo). */
  const chipMeta = (t: TipoMetadado, conteudo: ReactNode, rotulo: string) => (
    <button
      type="button"
      aria-expanded={metaEditando === t}
      aria-label={rotulo}
      onClick={() => alternarEditor(t)}
      className={`inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-control px-2 text-[13px] font-semibold text-text-2 transition-colors hover:bg-surface-2 lg:min-h-[var(--h-control-sm)] ${metaEditando === t ? "bg-surface-2 ring-2 ring-accent/30" : "bg-surface-2/60"}`}
    >
      {conteudo}
    </button>
  );
  const envolvidosRasc = [...new Set([...r.pessoas, ...pelaEquipe.map((p) => p.id)])].map((id) => todas.find((p) => p.id === id)).filter((p): p is Pessoa => !!p);
  const valorMetadado = (t: TipoMetadado): ReactNode => {
    switch (t) {
      case "membros":
        return chipMeta(
          t,
          envolvidosRasc.length ? (
            <span className="flex -space-x-1.5">
              {envolvidosRasc.slice(0, 6).map((p) => (
                <Avatar key={p.id} nome={p.nome} foto={p.foto} size="sm" className="ring-2 ring-surface" />
              ))}
              {envolvidosRasc.length > 6 && <span className="pl-2 text-[12px] text-muted">+{envolvidosRasc.length - 6}</span>}
            </span>
          ) : (
            <span className="text-muted">Ninguém</span>
          ),
          `Membros: ${envolvidosRasc.map((p) => nomeExibicao(p)).join(", ") || "ninguém"} — editar`,
        );
      case "etiquetas":
        return <SeletorEtiquetas etiquetas={etiquetas} marcados={r.etiquetas} onChange={(v) => set("etiquetas", v)} quadroId={quadroId} podeEditar={podeExcluir} onMudouEtiquetas={onSalvo} />;
      case "datas": {
        const texto = [r.inicio ? `${rotuloData(r.inicio, hoje)} –` : "", r.prazo ? rotuloData(r.prazo, hoje, r.prazoHora || null) : r.inicio ? "sem prazo" : ""].filter(Boolean).join(" ");
        return chipMeta(
          t,
          <>
            <span className="tabular-nums">{texto || "Sem datas"}</span>
            {r.prazo && (
              <span className="rounded-full px-1.5 text-[11px]" style={{ color: COR_ESTADO_PRAZO[estadoDatas], background: `color-mix(in srgb, ${COR_ESTADO_PRAZO[estadoDatas]} 14%, var(--surface))` }}>
                {concluida ? "Concluída" : ROTULO_ESTADO_PRAZO[estadoDatas]}
              </span>
            )}
            {r.recorrencia && <span className="text-[11.5px] font-normal text-muted">· {rotuloRecorrencia(r.recorrencia)}</span>}
          </>,
          `Datas: ${texto || "sem datas"} — editar`,
        );
      }
      case "prioridade":
        return chipMeta(
          t,
          <>
            <IconBandeira className="h-4 w-4" style={{ color: COR_PRIORIDADE[r.prioridade] }} />
            {ROTULO_PRIORIDADE[r.prioridade]}
          </>,
          `Prioridade ${ROTULO_PRIORIDADE[r.prioridade]} — editar`,
        );
      case "estimativa":
        return chipMeta(t, <span className="tabular-nums">{r.estimativa.trim() ? `${r.estimativa} h` : "Sem estimativa"}</span>, `Estimativa: ${r.estimativa || "nenhuma"} — editar`);
    }
  };
  /** O EDITOR de um metadado (logo abaixo da faixa). */
  const editorMetadado = (t: TipoMetadado): ReactNode => {
    switch (t) {
      case "membros":
        return (
          <div className="space-y-4">
            <Secao titulo="Responsáveis">
              <SeletorPessoas
                pessoas={pessoas}
                fora={fora}
                selecionadas={r.pessoas}
                usuarioId={usuarioId}
                onChange={(v) => setR((x) => (x ? { ...x, pessoas: v, observadores: x.observadores.filter((o) => !v.includes(o)) } : x))}
              />
            </Secao>
            {equipes.length > 0 && (
              <Secao titulo="Equipes">
                <ChipsAlternar itens={equipes} marcados={r.equipes} onChange={(v) => set("equipes", v)} rotulo="Equipe" />
                {pelaEquipe.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                    <span>Pela equipe:</span>
                    {pelaEquipe.map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-1 text-text-2" title={p.nome}>
                        <Avatar nome={p.nome} foto={p.foto} size="xs" />
                        {nomeExibicao(p)}
                      </span>
                    ))}
                  </div>
                )}
              </Secao>
            )}
            <Secao titulo="Observadores (acompanham)">
              <SeletorPessoas pessoas={pessoas.filter((p) => !r.pessoas.includes(p.id))} fora={fora} selecionadas={r.observadores} usuarioId={usuarioId} onChange={(v) => set("observadores", v)} />
            </Secao>
          </div>
        );
      case "datas":
        return (
          <div className="space-y-4">
            <DatasTarefa valor={r} hoje={hoje} concluida={concluida} onChange={(patch) => setR((x) => (x ? { ...x, ...patch } : x))} />
            <Secao titulo="Repetir">
              <RecorrenciaTarefa valor={r.recorrencia} onChange={(v) => set("recorrencia", v)} prazo={r.prazo || null} inicio={r.inicio || null} hoje={hoje} />
            </Secao>
            {(r.inicio || r.prazo || r.recorrencia) && (
              <Button variant="ghost" size="sm" onClick={() => setR((x) => (x ? { ...x, inicio: "", prazo: "", prazoHora: "", lembreteMin: null, recorrencia: null } : x))}>
                Remover as datas
              </Button>
            )}
          </div>
        );
      case "prioridade":
        return (
          <Segmented<Prioridade>
            ariaLabel="Prioridade"
            value={r.prioridade}
            onChange={(v) => set("prioridade", v)}
            options={PRIORIDADES.map((p) => ({ value: p, label: ROTULO_PRIORIDADE[p], icone: <IconBandeira className="h-3.5 w-3.5" style={{ color: COR_PRIORIDADE[p] }} /> }))}
          />
        );
      case "estimativa":
        return (
          <TextField
            label="Estimativa (horas)"
            inputMode="decimal"
            value={r.estimativa}
            placeholder="Ex.: 4 ou 1,5"
            error={estOk ? undefined : "Um número de 0 a 9999."}
            onChange={(e) => set("estimativa", e.target.value)}
          />
        );
      default:
        return null;
    }
  };

  const painelAtividade = idAberto
    ? [
        {
          id: "atividade",
          aberto: atividade,
          largura: 30,
          titulo: "Comentários e atividade",
          onClose: () => setAtividade(false),
          children: (
            <AtividadeTarefa
              comentarios={conteudo?.comentarios ?? []}
              historico={{ linhas: historico.linhas, erro: historico.erro, onDetalhes: setDetalhesHist }}
              pessoas={todas}
              usuarioId={usuarioId}
              podeModerar={podeExcluir}
              onEnviar={(texto) => agir(() => chamar(`${base}/comentarios`, "POST", { texto }))}
              onEditar={(c, texto) => agir(() => chamar(`${base}/comentarios/${c.id}`, "PATCH", { texto }))}
              onExcluir={async (c) => {
                if (await confirmar({ titulo: "Excluir o comentário?", confirmar: "Excluir", perigo: true })) agir(() => chamar(`${base}/comentarios/${c.id}`, "DELETE"));
              }}
            />
          ),
        },
      ]
    : undefined;

  /** O menu "…" do cabeçalho (como o do Trello): copiar, mover para outro quadro, criar template e copiar o link. */
  const menuTarefa = (t: TarefaResumo) => (
    <Dropdown align="end" width={250} ariaLabel="Mais ações da tarefa" triggerClassName="h-11 w-11 justify-center text-muted lg:h-9 lg:w-9" trigger={<IconMais className="h-4 w-4" />}>
      {(fecharMenu) => {
        const item = (rotulo: string, icone: ReactNode, fn: () => void, off = false) => (
          <button
            key={rotulo}
            type="button"
            disabled={off}
            onClick={() => {
              fecharMenu();
              fn();
            }}
            className="flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left text-[13px] text-text hover:bg-surface-2 disabled:opacity-40"
          >
            {icone}
            <span className="truncate">{rotulo}</span>
          </button>
        );
        // Copiar/mover levam o que está GRAVADO — com alterações por salvar, salve antes.
        const off = sujo || salvando != null;
        return (
          <div className="space-y-0.5">
            {onDuplicar && item("Duplicar", <IconCopy className="h-4 w-4 text-muted" />, () => onDuplicar(t.id), off)}
            {onCopiarMover && item("Copiar…", <IconCopy className="h-4 w-4 text-muted" />, () => onCopiarMover(t.id, "copiar"), off)}
            {onCopiarMover && item("Mover para outro quadro…", <IconArrowRight className="h-4 w-4 text-muted" />, () => onCopiarMover(t.id, "mover"), off)}
            {onCopiarMover && !t.template && item("Criar template…", <IconModelo className="h-4 w-4 text-muted" />, () => onCopiarMover(t.id, "template"), off)}
            {item("Copiar link", <IconLink className="h-4 w-4 text-muted" />, () => {
              const url = `${window.location.origin}${linkTarefa(quadroId, t.id)}`;
              navigator.clipboard?.writeText(url).then(
                () => toast.success("Link copiado."),
                () => toast.error("Não foi possível copiar o link."),
              );
            })}
            {off && onCopiarMover && <p className="px-2 pb-1 text-[11.5px] text-muted">Salve as alterações para copiar ou mover.</p>}
          </div>
        );
      }}
    </Dropdown>
  );

  return (
    <>
      <Modal
        open
        onClose={fechar}
        titulo={nova ? "Nova tarefa" : `Tarefa ${existente ? rotuloTicket(existente.ticket) : ""}`}
        size="lg"
        larguraPrincipal={44}
        paineis={desk ? painelAtividade : undefined}
        esquerda={esquerda}
        principalNoTopo={!!esquerda?.length}
        bloqueado={salvando != null}
        acoesCabecalho={existente && menuTarefa(existente)}
        cabecalho={
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {existente ? <Badge tone="blue">{rotuloTicket(existente.ticket)}</Badge> : <Badge>Nova</Badge>}
            <h2 className="min-w-0 truncate text-base font-semibold text-text">{nova ? "Nova tarefa" : existente?.titulo}</h2>
            {existente?.arquivada && <Badge>Arquivada</Badge>}
            {existente?.template && <Badge tone="violet">Template</Badge>}
            {concluida && (
              <Badge tone="emerald">
                <IconCheck className="h-3 w-3" />
                Concluída
              </Badge>
            )}
          </div>
        }
        rodape={
          <div className="flex flex-wrap items-center gap-2">
            {existente && (
              <Button
                variant="ghost"
                size="sm"
                loading={salvando === "arquivar"}
                disabled={salvando != null}
                aria-label={existente.arquivada ? "Restaurar" : "Arquivar"}
                icon={existente.arquivada ? <IconDesarquivar className="h-4 w-4" /> : <IconArquivar className="h-4 w-4" />}
                onClick={arquivar}
              >
                <span className="max-sm:hidden">{existente.arquivada ? "Restaurar" : "Arquivar"}</span>
              </Button>
            )}
            {existente && podeExcluir && (
              <Button
                variant="ghost"
                size="sm"
                loading={salvando === "excluir"}
                disabled={salvando != null}
                aria-label="Excluir tarefa"
                title="Excluir tarefa"
                icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
                onClick={excluir}
              />
            )}
            {existente && desk && (
              <Button variant={atividade ? "secondary" : "ghost"} size="sm" aria-pressed={atividade} icon={<IconComentario className="h-4 w-4" />} onClick={() => setAtividade((a) => !a)}>
                Atividade{nComentarios ? ` (${nComentarios})` : ""}
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" disabled={salvando != null} onClick={fechar}>
                {sujo ? "Cancelar" : "Fechar"}
              </Button>
              {existente && !existente.arquivada && !existente.template && (
                <Button
                  variant="secondary"
                  disabled={!pode}
                  icon={<IconCheck className="h-4 w-4" style={concluida ? undefined : { color: "var(--ok)" }} />}
                  onClick={() => salvar(!concluida)}
                >
                  {concluida ? "Reabrir" : "Concluir"}
                </Button>
              )}
              <Button loading={salvando === "salvar"} disabled={!pode || (!nova && !sujo)} onClick={() => salvar()}>
                {nova ? "Criar tarefa" : "Salvar"}
              </Button>
            </div>
          </div>
        }
      >
        {!desk && existente && (
          <div className="mb-4">
            <Segmented<"tarefa" | "atividade">
              ariaLabel="Tarefa ou atividade"
              value={atividade ? "atividade" : "tarefa"}
              onChange={(v) => setAtividade(v === "atividade")}
              options={[
                { value: "tarefa", label: "Tarefa" },
                { value: "atividade", label: `Atividade${nComentarios ? ` (${nComentarios})` : ""}` },
              ]}
            />
          </div>
        )}
        {!desk && atividade && painelAtividade ? (
          <div className="flex min-h-[60dvh] flex-col gap-3">
            <div className="flex min-h-0 flex-1 flex-col">{painelAtividade[0].children}</div>
          </div>
        ) : (
        <div className="space-y-4">
          {/* CÍRCULO de concluir + TÍTULO no lugar (como no Trello). */}
          <div className="flex items-start gap-2">
            {existente && !existente.template && !existente.arquivada && (
              <span className="mt-1.5">
                <CirculoConcluir concluida={concluida} tamanho="md" rotulo={concluida ? "Reabrir a tarefa" : "Concluir a tarefa"} disabled={!pode} onAlternar={() => salvar(!concluida)} />
              </span>
            )}
            <TituloNoLugar
              valor={r.titulo}
              focar={nova || (aberto.tipo === "editar" && !!aberto.focoTitulo)}
              cursorNoFim={aberto.tipo === "editar" && !!aberto.focoTitulo}
              onChange={setTitulo}
            />
          </div>
          {formatoTitulo && (
            <p className="flex flex-wrap items-center gap-2 pl-1 text-[12px] text-muted">
              {r.tituloManual ? "Título escrito à mão — os campos não o mudam." : "Título automático — segue os campos da tarefa."}
              {r.tituloManual && automatico(r.campos) && (
                <Button variant="ghost" size="xs" onClick={voltarAoAutomatico}>
                  Usar o automático
                </Button>
              )}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pl-1">
            <SelectField
              label="Na lista"
              compacto
              value={String(r.listaId)}
              onChange={(e) => set("listaId", Number(e.target.value))}
            >
              {listas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                  {l.concluida ? " (concluídas)" : ""}
                </option>
              ))}
              {!listaAtual && <option value={r.listaId}>Lista arquivada</option>}
            </SelectField>
            <MenuAdicionarCartao
              metadados={TIPOS_METADADO.filter((t) => !metaVisiveis.includes(t))}
              blocos={blocosDisponiveis(r.blocos)}
              disabled={carregando}
              onMetadado={(t) => {
                setMetaExtras((m) => [...m, t]);
                setMetaEditando(t);
              }}
              onBloco={(t) => setBlocos((l) => adicionarBloco(l, t))}
            />
            {!nova && r.listaId !== inicial.listaId && <p className="w-full text-[12px] text-muted">Ao salvar, a tarefa vai para o fim desta lista.</p>}
          </div>
          {metaVisiveis.length > 0 && (
            <div className="flex flex-wrap gap-x-5 gap-y-3 pl-1">
              {metaVisiveis.map((t) => (
                <div key={t} className="min-w-0">
                  <p className="mb-1 flex items-center gap-1 text-[12px] font-semibold text-muted">
                    {(() => {
                      const Icone = ICONE_METADADO[t];
                      return <Icone className="h-3.5 w-3.5" />;
                    })()}
                    {ROTULO_METADADO[t]}
                  </p>
                  {valorMetadado(t)}
                </div>
              ))}
            </div>
          )}
          {metaEditando && metaVisiveis.includes(metaEditando) && metaEditando !== "etiquetas" && (
            <div className="animate-fade-in-up rounded-card border border-border bg-surface-2/50 p-[var(--pad-card)]">
              {editorMetadado(metaEditando)}
              <div className="mt-3 flex justify-end">
                <Button size="sm" variant="secondary" onClick={() => setMetaEditando(null)}>
                  Pronto
                </Button>
              </div>
            </div>
          )}
          {campos.length > 0 && (
            <Secao titulo="Campos personalizados">
              <CamposDaTarefa campos={campos} valores={r.campos} onChange={setCampo} disabled={carregando} />
            </Secao>
          )}
          <Secao titulo="Descrição">
            <CampoTextoFormatado
              key={carregando ? "carregando" : "pronto"}
              valor={r.descricao}
              onChange={(v) => set("descricao", v)}
              rotulo="Descrição"
              vazio={carregando ? "Carregando…" : "Adicione uma descrição mais detalhada…"}
              maxLength={10_000}
              disabled={carregando}
            />
          </Secao>
          <div ref={listaBlocos} className="space-y-3">
            {r.blocos.map((b, i) => (
              <Fragment key={b.id}>
                {arrasto && arrasto.indice === i - (movendo && r.blocos.findIndex((x) => x.id === movendo) < i ? 1 : 0) && b.id !== movendo && <GuiaBloco />}
                <MolduraBloco
                  id={b.id}
                  tipo={b.tipo}
                  primeiro={i === 0}
                  ultimo={i === r.blocos.length - 1}
                  disabled={carregando}
                  arrastando={b.id === movendo}
                  onPegar={(e) => arrastoBlocos.iniciar(e, { id: b.id }, ROTULO_BLOCO[b.tipo])}
                  onMover={(d) => setBlocos((l) => moverBloco(l, b.id, i + d))}
                  onRemover={() => tirarBloco(b)}
                >
                  {conteudoBloco(b)}
                </MolduraBloco>
              </Fragment>
            ))}
            {arrasto && arrasto.indice >= r.blocos.length - (movendo ? 1 : 0) && <GuiaBloco />}
          </div>
          {arrasto && <ChipPreso rotulo={arrasto.rotulo} x={arrasto.x} y={arrasto.y} fantasma={arrastoBlocos.fantasma} />}
        </div>
        )}
      </Modal>
      {confirmacao}
    </>
  );
}

/**
 * CHIPS de alternância na COR de cada item (etiquetas e equipes da tarefa): marcado = fundo e contorno mais fortes + ✓.
 * Alvos de 44px no toque.
 */
export function ChipsAlternar({
  itens,
  marcados,
  onChange,
  rotulo,
}: {
  itens: { id: number; nome: string; cor: string }[];
  marcados: number[];
  onChange: (ids: number[]) => void;
  /** O que cada chip é ("Etiqueta", "Equipe") — o nome acessível. */
  rotulo: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {itens.map((e) => {
        const ativa = marcados.includes(e.id);
        return (
          <button
            key={e.id}
            type="button"
            aria-pressed={ativa}
            aria-label={`${rotulo}: ${e.nome}`}
            onClick={() => onChange(ativa ? marcados.filter((x) => x !== e.id) : [...marcados, e.id])}
            className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold transition-[box-shadow,opacity] duration-[var(--motion-duration)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:h-[var(--h-control-sm)]"
            style={{
              color: e.cor,
              background: `color-mix(in srgb, ${e.cor} ${ativa ? 18 : 6}%, var(--surface))`,
              boxShadow: `inset 0 0 0 ${ativa ? 2 : 1}px color-mix(in srgb, ${e.cor} ${ativa ? 70 : 25}%, transparent)`,
            }}
          >
            {ativa && <IconCheck className="h-3.5 w-3.5" />}
            {e.nome}
          </button>
        );
      })}
    </div>
  );
}

/** O TÍTULO da tarefa editado NO LUGAR (grande, cresce com o texto; Enter não quebra linha). */
function TituloNoLugar({ valor, focar, cursorNoFim, onChange }: { valor: string; focar: boolean; cursorNoFim: boolean; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reajusta a altura a cada mudança do texto.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [valor]);
  return (
    <textarea
      ref={ref}
      value={valor}
      rows={1}
      maxLength={200}
      aria-label="Título"
      placeholder="O que precisa ser feito"
      // biome-ignore lint/a11y/noAutofocus: tarefa nova e a criada de um template abrem para escrever o título.
      autoFocus={focar}
      onFocus={(e) => {
        // Criada de um TEMPLATE: o cursor no FIM do título (completa-se o "2. Protocolo - FALTA - ").
        if (cursorNoFim) e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      className="min-h-11 w-full min-w-0 flex-1 resize-none overflow-hidden rounded-control border border-transparent bg-transparent px-2 py-1.5 text-[17px] font-bold leading-snug text-text outline-none transition-[border-color,box-shadow] duration-[var(--motion-duration)] placeholder:text-faint hover:bg-surface-2 focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/20"
    />
  );
}
