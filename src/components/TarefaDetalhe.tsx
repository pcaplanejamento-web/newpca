"use client";

import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ChipPreso, GuiaBloco, MolduraBloco, PaletaBlocos, useArrastoBlocos } from "./BlocosTarefa";
import { acoesChecklistRascunho, type ChecklistRascunho, ChecklistTarefa, useChecklistServidor } from "./ChecklistTarefa";
import { ComentariosTarefa } from "./ComentariosTarefa";
import { useConfirmacao } from "./Confirmacao";
import { ehDesktop } from "./espacamento";
import { SelectField, TextArea, TextField } from "./Field";
import { Historico, useHistorico } from "./Historico";
import { LinkExterno } from "./LinkExterno";
import type { ModoCopia } from "./CopiarMoverTarefa";
import { Dropdown } from "./Dropdown";
import { IconArquivar, IconArrowRight, IconBandeira, IconCheck, IconComentario, IconCopy, IconDesarquivar, IconLink, IconMais, IconModelo, IconTrash } from "./icons";
import { EventosTarefa } from "./EventosTarefa";
import { DatasTarefa } from "./DatasTarefa";
import { Modal, type ModalPainel } from "./Modal";
import { RecorrenciaTarefa } from "./RecorrenciaTarefa";
import { Segmented } from "./Segmented";
import { SeletorPessoas } from "./SeletorPessoas";
import { toast } from "./Toast";
import { VinculoTarefa } from "./VinculoTarefa";

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
  vinculo: Vinculo | null;
  descricao: string;
  recorrencia: Recorrencia | null;
  /** Os checklists da tarefa NOVA (nome + textos — vão junto no POST). */
  checklists: ChecklistRascunho[];
  /** Os EVENTOS da tarefa NOVA (vão junto no POST; na gravada, gravam na hora). */
  eventos: DadosEvento[];
  /** Os BLOCOS, na ordem (a paleta). */
  blocos: BlocoTarefa[];
};
type Conteudo = { checklists: ChecklistNomeado[]; checklist: ItemChecklist[]; comentarios: ComentarioTarefa[]; eventos: EventoTarefa[] };

const iguais = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));
const mesmoVinculo = (a: Vinculo | null, b: Vinculo | null) => (a?.tipo ?? null) === (b?.tipo ?? null) && (a?.id ?? null) === (b?.id ?? null);
const numEstimativa = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

/** O que decide se um bloco de campo tem dado — a partir do rascunho. */
const dadosDoRascunho = (r: Omit<Rascunho, "blocos">, checklist: number, eventos: number): DadosBlocos => ({
  inicio: r.inicio || null,
  prazo: r.prazo || null,
  pessoas: r.pessoas,
  observadores: r.observadores,
  equipes: r.equipes,
  etiquetas: r.etiquetas,
  vinculo: r.vinculo,
  estimativaH: r.estimativa.trim() ? 1 : null,
  recorrencia: r.recorrencia,
  checklist,
  eventos,
});

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[13.5px] font-bold text-text">{titulo}</p>
      {children}
    </div>
  );
}

/**
 * DETALHE de uma tarefa (criar e editar) num banner. Fixos no topo: título, lista, prioridade e descrição. O resto é
 * montado por BLOCOS (a paleta — arraste até o lugar ou toque para acrescentar): Nota, Checklist, Link, Prazo (início +
 * prazo com o semáforo), Responsáveis (+ observadores), Etiquetas, Vínculo, Estimativa e Recorrência — na ordem escolhida
 * (alça, ↑/↓). "Salvar" manda SÓ o que mudou; o CHECKLIST da tarefa gravada grava na hora (otimista, em fila). No painel
 * da direita, a ATIVIDADE — comentários com @menção | histórico. O menu "…" do cabeçalho: Copiar · Mover para outro quadro
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
  pessoas,
  todas,
  hoje,
  usuarioId,
  podeExcluir,
  onCopiarMover,
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
  const [abaAtividade, setAbaAtividade] = useState<"comentarios" | "historico">("comentarios");
  const [versaoHist, setVersaoHist] = useState(0);
  const { confirmar, confirmacao } = useConfirmacao();
  const pedido = useRef(0);
  const historico = useHistorico(atividade && abaAtividade === "historico" && idAberto ? `/api/tarefas/${idAberto}/historico?v=${versaoHist}` : null);

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
          vinculo: existente.vinculo,
          descricao: "",
          recorrencia: existente.recorrencia,
          checklists: [],
          eventos: [],
          blocos: [],
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
          vinculo: aberto.tipo === "nova" ? (aberto.vinculo ?? null) : null,
          descricao: "",
          recorrencia: null,
          checklists: [],
          eventos: [],
          blocos: [],
        };
    base.blocos = blocosDaTarefa(existente ? null : [], dadosDoRascunho(base, existente?.checklist.total ?? 0, existente?.eventos ?? 0));
    setR(base);
    setInicial(base);
    setDesk(ehDesktop());
    setAtividade(aberto.tipo === "editar" && ehDesktop());
    setAbaAtividade("comentarios");
    if (aberto.tipo === "editar") carregar(aberto.id, true);
  }, [aberto?.tipo, idAberto, aberto?.tipo === "nova" ? aberto.listaId : null]);

  // Os checklists gravados como o hook os pede — o MESMO objeto enquanto o conteúdo não muda (senão o hook recomeçaria).
  const checklistsGravados = useMemo(() => (conteudo ? { checklists: conteudo.checklists, itens: conteudo.checklist } : null), [conteudo]);
  const checklistServidor = useChecklistServidor(idAberto ? `/api/tarefas/${idAberto}` : null, checklistsGravados, onSalvo);
  const listaBlocos = useRef<HTMLDivElement>(null);
  const soltarBloco = (carga: { tipo: "novo"; bloco: BlocoTarefa["tipo"] } | { tipo: "mover"; id: string }, indice: number) =>
    setR((x) => (x ? { ...x, blocos: carga.tipo === "novo" ? adicionarBloco(x.blocos, carga.bloco, indice) : moverBloco(x.blocos, carga.id, indice) } : x));
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
          vinculo: r.vinculo ? { tipo: r.vinculo.tipo, id: r.vinculo.id } : null,
          recorrencia: r.recorrencia,
          checklists: r.checklists.map((c) => ({ nome: c.nome.trim() || "Checklist", itens: c.itens.map((t) => t.trim()).filter(Boolean) })),
          eventos: r.eventos,
          blocos: blocosParaGravar(r.blocos),
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
        if (!mesmoVinculo(r.vinculo, inicial.vinculo)) d.vinculo = r.vinculo ? { tipo: r.vinculo.tipo, id: r.vinculo.id } : null;
        if (r.descricao !== inicial.descricao) d.descricao = r.descricao.trim() || null;
        if (JSON.stringify(r.recorrencia) !== JSON.stringify(inicial.recorrencia)) d.recorrencia = r.recorrencia;
        if (JSON.stringify(r.blocos) !== JSON.stringify(inicial.blocos)) d.blocos = blocosParaGravar(r.blocos);
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
            : "O campo fica vazio ao salvar.";
      if (!(await confirmar({ titulo: `Remover o bloco ${ROTULO_BLOCO[b.tipo]}?`, texto, confirmar: "Remover", perigo: true }))) return;
    }
    if (b.tipo === "checklist" && !nova) for (const c of acoesChecklist?.checklists ?? []) acoesChecklist?.removerChecklist(c.id);
    if (b.tipo === "eventos" && !nova) for (const e of conteudo?.eventos ?? []) await agir(() => chamar(`/api/tarefas/eventos/${e.id}`, "DELETE"));
    setR((x) => {
      if (!x) return x;
      const y = { ...x, blocos: removerBloco(x.blocos, b.id) };
      if (b.tipo === "prazo") Object.assign(y, { inicio: "", prazo: "", prazoHora: "", lembreteMin: null });
      else if (b.tipo === "pessoas") Object.assign(y, { pessoas: [], observadores: [], equipes: [] });
      else if (b.tipo === "etiquetas") y.etiquetas = [];
      else if (b.tipo === "vinculo") y.vinculo = null;
      else if (b.tipo === "estimativa") y.estimativa = "";
      else if (b.tipo === "recorrencia") y.recorrencia = null;
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
          <TextArea label="" aria-label="Nota" rows={4} value={b.texto} maxLength={MAX_NOTA} placeholder="Escreva a nota" onChange={(e) => setBloco(b.id, { texto: e.target.value })} />
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
      case "prazo":
        return <DatasTarefa valor={r} hoje={hoje} concluida={concluida} onChange={(patch) => setR((x) => (x ? { ...x, ...patch } : x))} />;
      case "pessoas":
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
      case "etiquetas":
        return etiquetas.length ? (
          <ChipsAlternar itens={etiquetas} marcados={r.etiquetas} onChange={(v) => set("etiquetas", v)} rotulo="Etiqueta" />
        ) : (
          <p className="text-[12.5px] text-muted">O quadro ainda não tem etiquetas — crie na aba Configuração.</p>
        );
      case "vinculo":
        return <VinculoTarefa valor={r.vinculo} onChange={(v) => set("vinculo", v)} />;
      case "estimativa":
        return (
          <TextField
            label="Horas"
            inputMode="decimal"
            value={r.estimativa}
            placeholder="Ex.: 4 ou 1,5"
            error={estOk ? undefined : "Um número de 0 a 9999."}
            onChange={(e) => set("estimativa", e.target.value)}
          />
        );
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
      case "recorrencia":
        return <RecorrenciaTarefa valor={r.recorrencia} onChange={(v) => set("recorrencia", v)} prazo={r.prazo || null} inicio={r.inicio || null} hoje={hoje} />;
    }
  };
  const arrasto = arrastoBlocos.arrasto;
  const movendo = arrasto?.carga.tipo === "mover" ? arrasto.carga.id : null;
  const nComentarios = conteudo?.comentarios.length ?? existente?.comentarios ?? 0;
  const listaAtual = listas.find((l) => l.id === r.listaId);

  const painelAtividade = idAberto
    ? [
        {
          id: "atividade",
          aberto: atividade,
          largura: 30,
          titulo: "Atividade",
          onClose: () => setAtividade(false),
          cabecalho: (
            <Segmented<"comentarios" | "historico">
              ariaLabel="Atividade da tarefa"
              value={abaAtividade}
              onChange={setAbaAtividade}
              options={[
                { value: "comentarios", label: `Comentários${nComentarios ? ` (${nComentarios})` : ""}` },
                { value: "historico", label: "Histórico" },
              ]}
            />
          ),
          children:
            abaAtividade === "comentarios" ? (
              <ComentariosTarefa
                comentarios={conteudo?.comentarios ?? []}
                pessoas={todas}
                usuarioId={usuarioId}
                podeModerar={podeExcluir}
                onEnviar={(texto) => agir(() => chamar(`${base}/comentarios`, "POST", { texto }))}
                onEditar={(c, texto) => agir(() => chamar(`${base}/comentarios/${c.id}`, "PATCH", { texto }))}
                onExcluir={async (c) => {
                  if (await confirmar({ titulo: "Excluir o comentário?", confirmar: "Excluir", perigo: true })) agir(() => chamar(`${base}/comentarios/${c.id}`, "DELETE"));
                }}
              />
            ) : (
              <Historico entradas={historico.linhas ?? []} carregando={!historico.linhas && !historico.erro} erro={historico.erro} vazio="Nenhuma alteração registrada." />
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
            {painelAtividade[0].cabecalho}
            <div className="flex min-h-0 flex-1 flex-col">{painelAtividade[0].children}</div>
          </div>
        ) : (
        <div className="space-y-4">
          <TextField label="Título" value={r.titulo} maxLength={200} placeholder="O que precisa ser feito" autoFocus={nova || (aberto.tipo === "editar" && aberto.focoTitulo)}
            onFocus={(e) => {
              // Criada de um TEMPLATE: o cursor no FIM do título (completa-se o "2. Protocolo - FALTA - ").
              if (aberto.tipo === "editar" && aberto.focoTitulo) e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length);
            }}
            onChange={(e) => set("titulo", e.target.value)}
          />
          <SelectField
            label="Lista"
            value={String(r.listaId)}
            hint={!nova && r.listaId !== inicial.listaId ? "Ao salvar, a tarefa vai para o fim desta lista." : undefined}
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
          <Secao titulo="Prioridade">
            <Segmented<Prioridade>
              ariaLabel="Prioridade"
              value={r.prioridade}
              onChange={(v) => set("prioridade", v)}
              options={PRIORIDADES.map((p) => ({
                value: p,
                label: ROTULO_PRIORIDADE[p],
                icone: <IconBandeira className="h-3.5 w-3.5" style={{ color: COR_PRIORIDADE[p] }} />,
              }))}
            />
          </Secao>
          <TextArea
            label="Descrição"
            rows={4}
            value={r.descricao}
            maxLength={10_000}
            disabled={carregando}
            placeholder={carregando ? "Carregando…" : "Detalhes, passos, contexto (opcional)"}
            onChange={(e) => set("descricao", e.target.value)}
          />
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
                  onPegar={(e) => arrastoBlocos.iniciar(e, { tipo: "mover", id: b.id }, ROTULO_BLOCO[b.tipo])}
                  onMover={(d) => setBlocos((l) => moverBloco(l, b.id, i + d))}
                  onRemover={() => tirarBloco(b)}
                >
                  {conteudoBloco(b)}
                </MolduraBloco>
              </Fragment>
            ))}
            {arrasto && arrasto.indice >= r.blocos.length - (movendo ? 1 : 0) && <GuiaBloco />}
          </div>
          <PaletaBlocos
            disponiveis={blocosDisponiveis(r.blocos)}
            disabled={carregando}
            onIniciar={(e, t) => arrastoBlocos.iniciar(e, { tipo: "novo", bloco: t }, ROTULO_BLOCO[t], () => setBlocos((l) => adicionarBloco(l, t)))}
            onAdicionar={(t) => setBlocos((l) => adicionarBloco(l, t))}
          />
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
