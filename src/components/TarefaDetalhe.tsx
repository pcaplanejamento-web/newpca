"use client";

import { Fragment, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { Pessoa } from "@/lib/pessoa";
import type { ComentarioTarefa, ItemChecklist } from "@/lib/tarefas";
import {
  adicionarBloco,
  type BlocoTarefa,
  blocosDaTarefa,
  blocosDisponiveis,
  blocosParaGravar,
  blocoTemDado,
  COR_ESTADO_PRAZO,
  type DadosBlocos,
  MAX_NOTA,
  MAX_TITULO_LINK,
  MAX_URL,
  moverBloco,
  removerBloco,
  ROTULO_BLOCO,
  urlValida,
  COR_PRIORIDADE,
  type EtiquetaTarefa,
  estadoPrazo,
  type ListaTarefas,
  type ModeloTarefa,
  type Prioridade,
  prazoDoModelo,
  PRIORIDADES,
  ROTULO_ESTADO_PRAZO,
  ROTULO_PRIORIDADE,
  rotuloTicket,
  type Recorrencia,
  type TarefaResumo,
  type VinculoTarefa as Vinculo,
} from "@/lib/tarefas-core";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { ChipPreso, GuiaBloco, MolduraBloco, PaletaBlocos, useArrastoBlocos } from "./BlocosTarefa";
import { acoesChecklistRascunho, ChecklistTarefa, useChecklistServidor } from "./ChecklistTarefa";
import { ComentariosTarefa } from "./ComentariosTarefa";
import { useConfirmacao } from "./Confirmacao";
import { ehDesktop } from "./espacamento";
import { SelectField, TextArea, TextField } from "./Field";
import { Historico, useHistorico } from "./Historico";
import { LinkExterno } from "./LinkExterno";
import { IconArquivar, IconBandeira, IconCheck, IconComentario, IconDesarquivar, IconModelo, IconTrash } from "./icons";
import { Modal } from "./Modal";
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
  | { tipo: "editar"; id: number };

type Rascunho = {
  titulo: string;
  listaId: number;
  prioridade: Prioridade;
  inicio: string;
  prazo: string;
  estimativa: string;
  pessoas: number[];
  observadores: number[];
  etiquetas: number[];
  vinculo: Vinculo | null;
  descricao: string;
  recorrencia: Recorrencia | null;
  /** O checklist da tarefa NOVA (textos — vão junto no POST; um modelo o preenche). */
  checklist: string[];
  /** Os BLOCOS, na ordem (a paleta). */
  blocos: BlocoTarefa[];
};
/** Um modelo de tarefa do quadro (o seletor "Usar modelo"). */
export type ModeloTarefaOpcao = { id: number; nome: string; conteudo: ModeloTarefa };
type Conteudo = { checklist: ItemChecklist[]; comentarios: ComentarioTarefa[] };

const iguais = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));
const mesmoVinculo = (a: Vinculo | null, b: Vinculo | null) => (a?.tipo ?? null) === (b?.tipo ?? null) && (a?.id ?? null) === (b?.id ?? null);
const numEstimativa = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

/** O que decide se um bloco de campo tem dado — a partir do rascunho. */
const dadosDoRascunho = (r: Omit<Rascunho, "blocos">, checklist: number): DadosBlocos => ({
  inicio: r.inicio || null,
  prazo: r.prazo || null,
  pessoas: r.pessoas,
  observadores: r.observadores,
  etiquetas: r.etiquetas,
  vinculo: r.vinculo,
  estimativaH: r.estimativa.trim() ? 1 : null,
  recorrencia: r.recorrencia,
  checklist,
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
 * da direita, a ATIVIDADE — comentários com @menção | histórico. Na criação, "Usar modelo" preenche o rascunho; a
 * existente vira MODELO. Arquivar/restaurar (qualquer pessoa do grupo) e excluir (editores). Fechar com alterações pede
 * confirmação.
 */
export function TarefaDetalhe({
  aberto,
  quadroId,
  tarefas,
  listas,
  etiquetas,
  pessoas,
  todas,
  hoje,
  usuarioId,
  podeExcluir,
  modelos = [],
  onFechar,
  onSalvo,
}: {
  aberto: AberturaTarefa | null;
  quadroId: number;
  tarefas: TarefaResumo[];
  /** As listas ATIVAS (destinos possíveis). */
  listas: ListaTarefas[];
  etiquetas: EtiquetaTarefa[];
  /** As pessoas do GRUPO (podem ser escolhidas). */
  pessoas: Pessoa[];
  /** Todas as conhecidas (as designadas fora do grupo seguem visíveis). */
  todas: Pessoa[];
  hoje: string;
  usuarioId: number;
  /** Editor (admin/gestor): exclui a tarefa e modera comentários. */
  podeExcluir: boolean;
  /** Os MODELOS de tarefa do quadro. */
  modelos?: ModeloTarefaOpcao[];
  onFechar: () => void;
  /** Algo foi gravado — o quadro recarrega (contagens do cartão). */
  onSalvo: () => void;
}) {
  const existente = aberto?.tipo === "editar" ? tarefas.find((t) => t.id === aberto.id) : undefined;
  const idAberto = aberto?.tipo === "editar" ? aberto.id : null;
  const [inicial, setInicial] = useState<Rascunho | null>(null);
  const [r, setR] = useState<Rascunho | null>(null);
  const [conteudo, setConteudo] = useState<Conteudo | null>(null);
  const [salvando, setSalvando] = useState<null | "salvar" | "arquivar" | "excluir">(null);
  const [atividade, setAtividade] = useState(false);
  // Desktop: a Atividade é um banner AO LADO; no celular (um banner por vez), uma aba "Tarefa | Atividade" no próprio corpo.
  const [desk, setDesk] = useState(true);
  const [abaAtividade, setAbaAtividade] = useState<"comentarios" | "historico">("comentarios");
  const [versaoHist, setVersaoHist] = useState(0);
  const [modeloNovo, setModeloNovo] = useState<{ nome: string; prazoDias: string } | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();
  const pedido = useRef(0);
  const historico = useHistorico(atividade && abaAtividade === "historico" && idAberto ? `/api/tarefas/${idAberto}/historico?v=${versaoHist}` : null);

  /** O conteúdo da tarefa aberta (descrição + blocos + checklist + comentários). Só a resposta MAIS RECENTE vale. */
  const carregar = useCallback(async (id: number, primeira: boolean) => {
    const n = ++pedido.current;
    try {
      const j = await chamar<{ tarefa: { descricao: string | null; blocos: BlocoTarefa[] | null } } & Conteudo>(`/api/tarefas/${id}`);
      if (n !== pedido.current) return;
      setConteudo({ checklist: j.checklist, comentarios: j.comentarios });
      if (primeira) {
        const descricao = j.tarefa.descricao ?? "";
        const comBlocos = (x: Rascunho | null) => (x ? { ...x, descricao, blocos: blocosDaTarefa(j.tarefa.blocos, dadosDoRascunho(x, j.checklist.length)) } : x);
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
          estimativa: existente.estimativaH == null ? "" : String(existente.estimativaH).replace(".", ","),
          pessoas: existente.pessoas,
          observadores: existente.observadores,
          etiquetas: existente.etiquetas,
          vinculo: existente.vinculo,
          descricao: "",
          recorrencia: existente.recorrencia,
          checklist: [],
          blocos: [],
        }
      : {
          titulo: "",
          listaId: aberto.tipo === "nova" ? aberto.listaId : (listas[0]?.id ?? 0),
          prioridade: "media",
          inicio: "",
          prazo: aberto.tipo === "nova" ? (aberto.prazo ?? "") : "",
          estimativa: "",
          pessoas: [],
          observadores: [],
          etiquetas: [],
          vinculo: aberto.tipo === "nova" ? (aberto.vinculo ?? null) : null,
          descricao: "",
          recorrencia: null,
          checklist: [],
          blocos: [],
        };
    base.blocos = blocosDaTarefa(existente ? null : [], dadosDoRascunho(base, existente?.checklist.total ?? 0));
    setR(base);
    setInicial(base);
    setDesk(ehDesktop());
    setAtividade(aberto.tipo === "editar" && ehDesktop());
    setAbaAtividade("comentarios");
    if (aberto.tipo === "editar") carregar(aberto.id, true);
  }, [aberto?.tipo, idAberto, aberto?.tipo === "nova" ? aberto.listaId : null]);

  const checklistServidor = useChecklistServidor(idAberto ? `/api/tarefas/${idAberto}` : null, conteudo?.checklist ?? null, onSalvo);
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
  const estado = estadoPrazo(r.prazo || null, hoje, concluida);
  const fora = todas.filter((p) => !pessoas.some((x) => x.id === p.id));
  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((x) => (x ? { ...x, [k]: v } : x));

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

  /** Grava; `listaDestino` = também leva a tarefa a essa lista (Concluir/Reabrir — o mesmo caminho: automações e recorrência). */
  const salvar = async (listaDestino?: number) => {
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
          estimativaH: est,
          pessoas: r.pessoas,
          observadores: r.observadores,
          etiquetas: r.etiquetas,
          vinculo: r.vinculo ? { tipo: r.vinculo.tipo, id: r.vinculo.id } : null,
          recorrencia: r.recorrencia,
          checklist: r.checklist.map((c) => c.trim()).filter(Boolean),
          blocos: blocosParaGravar(r.blocos),
        });
        toast.success("Tarefa criada.");
      } else if (existente) {
        const d: Record<string, unknown> = {};
        if (r.titulo.trim() !== inicial.titulo) d.titulo = r.titulo.trim();
        const lista = listaDestino ?? r.listaId;
        if (lista !== inicial.listaId) d.listaId = lista;
        if (r.prioridade !== inicial.prioridade) d.prioridade = r.prioridade;
        if (r.inicio !== inicial.inicio) d.inicio = r.inicio || null;
        if (r.prazo !== inicial.prazo) d.prazo = r.prazo || null;
        if (r.estimativa !== inicial.estimativa) d.estimativaH = est;
        if (!iguais(r.pessoas, inicial.pessoas)) d.pessoas = r.pessoas;
        if (!iguais(r.observadores, inicial.observadores)) d.observadores = r.observadores;
        if (!iguais(r.etiquetas, inicial.etiquetas)) d.etiquetas = r.etiquetas;
        if (!mesmoVinculo(r.vinculo, inicial.vinculo)) d.vinculo = r.vinculo ? { tipo: r.vinculo.tipo, id: r.vinculo.id } : null;
        if (r.descricao !== inicial.descricao) d.descricao = r.descricao.trim() || null;
        if (JSON.stringify(r.recorrencia) !== JSON.stringify(inicial.recorrencia)) d.recorrencia = r.recorrencia;
        if (JSON.stringify(r.blocos) !== JSON.stringify(inicial.blocos)) d.blocos = blocosParaGravar(r.blocos);
        if (Object.keys(d).length) await chamar(`/api/tarefas/${existente.id}`, "PATCH", d);
        toast.success(listaDestino == null ? "Tarefa salva." : listas.find((l) => l.id === listaDestino)?.concluida ? "Tarefa concluída." : "Tarefa reaberta.");
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

  /** "Usar modelo": o rascunho da tarefa NOVA recebe os campos do modelo (as etiquetas que ainda existem; o prazo relativo). */
  const usarModelo = (id: string) => {
    const m = modelos.find((x) => String(x.id) === id)?.conteudo;
    if (!m) return;
    setR((x) =>
      x
        ? {
            ...x,
            titulo: m.titulo,
            descricao: m.descricao ?? "",
            prioridade: m.prioridade,
            etiquetas: m.etiquetas.filter((e) => etiquetas.some((y) => y.id === e)),
            estimativa: m.estimativaH == null ? "" : String(m.estimativaH).replace(".", ","),
            prazo: prazoDoModelo(m, hoje) ?? "",
            recorrencia: m.recorrencia,
            checklist: m.checklist,
            // Os blocos do modelo + os de campo que o modelo preenche.
            blocos: blocosDaTarefa(
              m.blocos ?? [],
              dadosDoRascunho({ ...x, estimativa: m.estimativaH == null ? "" : "1", prazo: prazoDoModelo(m, hoje) ?? "", etiquetas: m.etiquetas, recorrencia: m.recorrencia }, m.checklist.length),
            ),
          }
        : x,
    );
  };

  const salvarComoModelo = async () => {
    if (!existente || !modeloNovo?.nome.trim()) return;
    const dias = modeloNovo.prazoDias.trim() === "" ? null : Number(modeloNovo.prazoDias);
    if (dias != null && (!Number.isInteger(dias) || dias < 0 || dias > 3650)) return toast.error("Prazo: dias inteiros de 0 a 3650.");
    try {
      await chamar("/api/tarefas/modelos", "POST", { tipo: "tarefa", nome: modeloNovo.nome.trim(), tarefaId: existente.id, prazoDias: dias });
      toast.success("Modelo salvo — use em “Nova tarefa”.");
      setModeloNovo(null);
      onSalvo();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const acoesChecklist = nova ? acoesChecklistRascunho(r.checklist, (v) => set("checklist", v)) : checklistServidor;
  const nChecklist = acoesChecklist?.itens.length ?? existente?.checklist.total ?? 0;
  const setBlocos = (fn: (l: BlocoTarefa[]) => BlocoTarefa[]) => setR((x) => (x ? { ...x, blocos: fn(x.blocos) } : x));
  const setBloco = (id: string, patch: Partial<{ texto: string; url: string; titulo: string }>) =>
    setBlocos((l) => l.map((b) => (b.id === id ? ({ ...b, ...patch } as BlocoTarefa) : b)));

  /** REMOVER um bloco: o de campo limpa o campo (com dado, pede confirmação; o checklist gravado exclui os itens). */
  const tirarBloco = async (b: BlocoTarefa) => {
    const temDado =
      b.tipo === "nota" ? b.texto.trim() !== "" : b.tipo === "link" ? b.url.trim() !== "" : blocoTemDado(b.tipo, dadosDoRascunho(r, nChecklist));
    if (temDado) {
      const texto =
        b.tipo === "checklist" && !nova
          ? `Os ${nChecklist} itens do checklist serão excluídos agora.`
          : b.tipo === "nota" || b.tipo === "link"
            ? "O conteúdo sai da tarefa ao salvar."
            : "O campo fica vazio ao salvar.";
      if (!(await confirmar({ titulo: `Remover o bloco ${ROTULO_BLOCO[b.tipo]}?`, texto, confirmar: "Remover", perigo: true }))) return;
    }
    if (b.tipo === "checklist" && !nova) for (const i of acoesChecklist?.itens ?? []) acoesChecklist?.remover(i.id);
    setR((x) => {
      if (!x) return x;
      const y = { ...x, blocos: removerBloco(x.blocos, b.id) };
      if (b.tipo === "prazo") Object.assign(y, { inicio: "", prazo: "" });
      else if (b.tipo === "pessoas") Object.assign(y, { pessoas: [], observadores: [] });
      else if (b.tipo === "etiquetas") y.etiquetas = [];
      else if (b.tipo === "vinculo") y.vinculo = null;
      else if (b.tipo === "estimativa") y.estimativa = "";
      else if (b.tipo === "recorrencia") y.recorrencia = null;
      else if (b.tipo === "checklist") y.checklist = [];
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
            rascunho={nova}
            onRemover={nova ? undefined : (i) => confirmar({ titulo: `Remover "${i.texto}" do checklist?`, confirmar: "Remover", perigo: true })}
          />
        ) : (
          <p className="text-[12.5px] text-muted">Carregando…</p>
        );
      case "prazo":
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Início" type="date" value={r.inicio} onChange={(e) => set("inicio", e.target.value)} />
            <TextField
              label="Prazo"
              type="date"
              value={r.prazo}
              onChange={(e) => set("prazo", e.target.value)}
              error={datasOk ? undefined : "O início não pode ser depois do prazo."}
              hint={
                r.prazo ? (
                  <span className="font-semibold" style={{ color: COR_ESTADO_PRAZO[estado] }}>
                    {ROTULO_ESTADO_PRAZO[estado]}
                  </span>
                ) : undefined
              }
            />
          </div>
        );
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
            <Secao titulo="Observadores (acompanham)">
              <SeletorPessoas pessoas={pessoas.filter((p) => !r.pessoas.includes(p.id))} fora={fora} selecionadas={r.observadores} usuarioId={usuarioId} onChange={(v) => set("observadores", v)} />
            </Secao>
          </div>
        );
      case "etiquetas":
        return etiquetas.length ? (
          <div className="flex flex-wrap gap-1.5">
            {etiquetas.map((e) => {
              const ativa = r.etiquetas.includes(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={ativa}
                  onClick={() => set("etiquetas", ativa ? r.etiquetas.filter((x) => x !== e.id) : [...r.etiquetas, e.id])}
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
      case "recorrencia":
        return <RecorrenciaTarefa valor={r.recorrencia} onChange={(v) => set("recorrencia", v)} prazo={r.prazo || null} inicio={r.inicio || null} hoje={hoje} />;
    }
  };
  const arrasto = arrastoBlocos.arrasto;
  const movendo = arrasto?.carga.tipo === "mover" ? arrasto.carga.id : null;
  const nComentarios = conteudo?.comentarios.length ?? existente?.comentarios ?? 0;
  const listaAtual = listas.find((l) => l.id === r.listaId);
  const listaConcluidas = listas.find((l) => l.concluida);
  const listaAberta = listas.find((l) => !l.concluida);

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

  return (
    <>
      <Modal
        open
        onClose={fechar}
        titulo={nova ? "Nova tarefa" : `Tarefa ${existente ? rotuloTicket(existente.ticket) : ""}`}
        size="lg"
        larguraPrincipal={44}
        paineis={desk ? painelAtividade : undefined}
        bloqueado={salvando != null}
        cabecalho={
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {existente ? <Badge tone="blue">{rotuloTicket(existente.ticket)}</Badge> : <Badge>Nova</Badge>}
            <h2 className="min-w-0 truncate text-base font-semibold text-text">{nova ? "Nova tarefa" : existente?.titulo}</h2>
            {existente?.arquivada && <Badge>Arquivada</Badge>}
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
            {existente && (
              <Button
                variant="ghost"
                size="sm"
                disabled={salvando != null}
                aria-label="Salvar como modelo"
                title="Salvar como modelo"
                icon={<IconModelo className="h-4 w-4" />}
                onClick={() => setModeloNovo({ nome: existente.titulo, prazoDias: "" })}
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
              {existente && !existente.arquivada && listaConcluidas && (concluida ? listaAberta : true) && (
                <Button
                  variant="secondary"
                  disabled={!pode}
                  icon={<IconCheck className="h-4 w-4" style={concluida ? undefined : { color: "var(--ok)" }} />}
                  onClick={() => salvar(concluida ? listaAberta?.id : listaConcluidas.id)}
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
          {nova && modelos.length > 0 && (
            <SelectField label="Usar modelo" value="" onChange={(e) => usarModelo(e.target.value)}>
              <option value="">Escolha um modelo para preencher…</option>
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </SelectField>
          )}
          <TextField label="Título" value={r.titulo} maxLength={200} placeholder="O que precisa ser feito" autoFocus={nova} onChange={(e) => set("titulo", e.target.value)} />
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
      <Modal
        open={modeloNovo != null}
        onClose={() => setModeloNovo(null)}
        titulo="Salvar como modelo"
        size="md"
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModeloNovo(null)}>
              Cancelar
            </Button>
            <Button disabled={!modeloNovo?.nome.trim()} onClick={salvarComoModelo}>
              Salvar modelo
            </Button>
          </div>
        }
      >
        {modeloNovo && (
          <div className="space-y-4">
            <TextField label="Nome do modelo" value={modeloNovo.nome} maxLength={80} onChange={(e) => setModeloNovo({ ...modeloNovo, nome: e.target.value })} />
            <TextField
              label="Prazo (dias depois de criar)"
              inputMode="numeric"
              value={modeloNovo.prazoDias}
              placeholder="Vazio = sem prazo"
              onChange={(e) => setModeloNovo({ ...modeloNovo, prazoDias: e.target.value })}
            />
            <p className="text-[12.5px] text-muted">Guarda título, descrição, prioridade, etiquetas, estimativa, recorrência e o checklist (desmarcado) — sem responsáveis nem vínculo.</p>
          </div>
        )}
      </Modal>
      {confirmacao}
    </>
  );
}
