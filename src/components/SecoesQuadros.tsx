"use client";

import { type ReactNode, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { predicadoBusca } from "@/lib/tabela-filtros";
import type { QuadroCard as QuadroCardDados } from "@/lib/tarefas";
import {
  type AtorPasta,
  CHAVE_CONJUNTOS_TAREFAS,
  type ConjuntoQuadros,
  type DestinoGrade,
  excluirPasta,
  itensDaGrade,
  MAX_NOME_CONJUNTO,
  MAX_QUADROS_CONJUNTO,
  motivoNaoMoverParaPasta,
  podePastaPublica,
  moverNaGrade,
  PALETA_ETIQUETAS,
  type PastasQuadros,
  podeEditarPasta,
} from "@/lib/tarefas-core";
import { Button } from "./Button";
import { ChipsEscolha } from "./ChipsEscolha";
import { useConfirmacao } from "./Confirmacao";
import { Dropdown } from "./Dropdown";
import { Checkbox, SearchField, TextField } from "./Field";
import { IconChevronRight, IconClock, IconEstrela, IconLayers, IconLock, IconMais, IconNenhum, IconPencil, IconTrash, IconUsers } from "./icons";
import { Modal } from "./Modal";
import { GradePastas } from "./PastasQuadros";
import { QuadroCard } from "./QuadroCard";
import { segurar } from "./segurar";
import { Switch } from "./Switch";
import { toast } from "./Toast";
import { useSetLocal } from "./useSetLocal";

/**
 * A GRADE de quadros — o MESMO `QuadroCard` e a MESMA grade na tela de Tarefas e no "Mudar de quadros": colunas de no
 * mínimo 15rem que se ajustam à largura (o card nunca muda de forma — sobra espaço, não encolhe). `extra` = o último item
 * (ex.: o card "Novo quadro").
 */
export function GradeQuadros({
  quadros,
  favoritos,
  onFavorito,
  atual,
  aba,
  onAbrir,
  extra,
  dicaArrasto = "Para organizar, arraste em “Seus quadros”",
}: {
  quadros: QuadroCardDados[];
  favoritos: number[];
  onFavorito?: (id: number) => void;
  /** O quadro aberto agora (o "Mudar de quadros"). */
  atual?: number;
  /** A aba em que o quadro abre (`?aba=`). */
  aba?: string;
  onAbrir?: () => void;
  extra?: ReactNode;
  /** O aviso quando alguém tenta ARRASTAR um card daqui (esta grade não se reordena). */
  dicaArrasto?: string;
}) {
  const { negado, iniciar, foiArrasto } = useArrastoNegado();
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
      {quadros.map((q) => (
        <div
          key={q.id}
          role="none"
          className={`relative [-webkit-touch-callout:none] ${negado === q.id ? "animate-negar-arrasto" : ""}`}
          onPointerDown={(e) => iniciar(e, q.id)}
          onDragStart={(e) => e.preventDefault()}
          onClickCapture={(e) => {
            if (foiArrasto()) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <QuadroCard
            quadro={q}
            href={`/painel/tarefas/${q.id}${aba ? `?aba=${aba}` : ""}`}
            atual={q.id === atual}
            favorito={favoritos.includes(q.id)}
            onFavorito={onFavorito && (() => onFavorito(q.id))}
            onAbrir={onAbrir}
          />
          {negado === q.id && (
            <span role="status" className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-card bg-[var(--scrim)] p-3 animate-fade-in-up">
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-center text-[12.5px] font-semibold text-text shadow-soft">
                <IconNenhum className="h-4 w-4 shrink-0" style={{ color: "var(--danger)" }} />
                {dicaArrasto}
              </span>
            </span>
          )}
        </div>
      ))}
      {extra}
    </div>
  );
}

/** Quanto tempo o aviso de arrasto negado fica à vista. */
const NEGADO_MS = 1600;

/**
 * O ARRASTO NEGADO de uma grade que não se reordena (Favoritos, Recentes, a busca): a tentativa — o mouse/caneta que anda
 * 6px segurando, ou o dedo que SEGURA ~400 ms parado (deslizar antes rola a tela) — não arrasta nada: o card SACODE
 * (`animate-negar-arrasto`), o cursor vira "não permitido" enquanto segura, o toque vibra e aparece o aviso por cima do
 * card. O arrasto NATIVO do link (a "imagem" do navegador) é bloqueado; o clique que vem depois é engolido.
 */
function useArrastoNegado() {
  const [negado, setNegado] = useState<number | null>(null);
  const arrastou = useRef(false);
  const encerrar = useRef<(() => void) | null>(null);
  const tempo = useRef(0);
  useEffect(
    () => () => {
      encerrar.current?.();
      window.clearTimeout(tempo.current);
    },
    [],
  );
  const iniciar = (e: ReactPointerEvent<HTMLElement>, id: number) => {
    if (!e.isPrimary || e.button > 0) return;
    encerrar.current?.();
    arrastou.current = false;
    const toque = e.pointerType === "touch";
    const x0 = e.clientX;
    const y0 = e.clientY;
    const ponteiro = e.pointerId;
    let espera = 0;
    let soltarCursor: (() => void) | null = null;
    const negar = () => {
      arrastou.current = true;
      if (toque) navigator.vibrate?.([25, 40, 25]);
      else soltarCursor = segurar("not-allowed");
      window.getSelection()?.removeAllRanges();
      // Uma tentativa nova no mesmo card sacode de novo (a classe sai e volta).
      setNegado(null);
      requestAnimationFrame(() => setNegado(id));
      window.clearTimeout(tempo.current);
      tempo.current = window.setTimeout(() => setNegado(null), NEGADO_MS);
      if (toque) limpar();
      else {
        window.removeEventListener("pointermove", mover);
      }
    };
    const mover = (ev: PointerEvent) => {
      if (ev.pointerId !== ponteiro) return;
      const d = Math.hypot(ev.clientX - x0, ev.clientY - y0);
      if (toque) {
        if (d > 8) limpar();
      } else if (d >= 6) negar();
    };
    const semMenu = (ev: Event) => ev.preventDefault();
    const limpar = () => {
      window.clearTimeout(espera);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", fim);
      window.removeEventListener("pointercancel", fim);
      window.removeEventListener("contextmenu", semMenu);
      soltarCursor?.();
      soltarCursor = null;
      encerrar.current = null;
    };
    const fim = (ev: PointerEvent) => {
      if (ev.pointerId !== ponteiro) return;
      limpar();
      // Só o clique LOGO depois da tentativa é engolido.
      if (arrastou.current) window.setTimeout(() => (arrastou.current = false), 0);
    };
    if (toque) {
      espera = window.setTimeout(negar, 400);
      window.addEventListener("contextmenu", semMenu);
    }
    encerrar.current = limpar;
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", fim);
    window.addEventListener("pointercancel", fim);
  };
  const foiArrasto = () => {
    const f = arrastou.current;
    arrastou.current = false;
    return f;
  };
  return { negado, iniciar, foiArrasto };
}

/** Os quadros abertos por ÚLTIMO neste aparelho (conveniência — `localStorage`, com try/catch). */
const CHAVE_RECENTES = "tarefas:quadros-recentes";
const MAX_RECENTES = 8;

function lerRecentes(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}

/** Registra o quadro aberto (o 1º dos recentes). Chamado pelo espaço do quadro. */
export function registrarQuadroRecente(id: number) {
  try {
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify([id, ...lerRecentes().filter((x) => x !== id)].slice(0, MAX_RECENTES)));
  } catch {
    // sem armazenamento: sem recentes
  }
}

/** Os ids dos quadros RECENTES (lidos depois da montagem — o HTML do servidor nasce sem eles). */
export function useQuadrosRecentes(): number[] {
  const [ids, setIds] = useState<number[]>([]);
  useEffect(() => setIds(lerRecentes()), []);
  return ids;
}

/** As SEÇÕES recolhidas (minimizadas) — as mesmas chaves na tela de Tarefas e no "Mudar de quadros", neste aparelho. */
export const useSecoesRecolhidas = () => useSetLocal<string>("tarefas:secoes-recolhidas");

/**
 * Uma SEÇÃO de quadros (como as do Trello: Favoritos, Visualizados recentemente, cada área de trabalho): o título com o
 * ícone e a contagem MINIMIZA/MAXIMIZA a grade (a seta gira; `aria-expanded`); `acoes` fica à direita (ex.: o menu do
 * conjunto). O conteúdo só é montado aberto.
 */
export function SecaoQuadros({
  titulo,
  icone,
  quantidade,
  recolhida,
  onAlternar,
  acoes,
  children,
}: {
  titulo: string;
  icone?: ReactNode;
  quantidade: number;
  recolhida: boolean;
  onAlternar: () => void;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          aria-expanded={!recolhida}
          title={recolhida ? `Mostrar ${titulo}` : `Minimizar ${titulo}`}
          onClick={onAlternar}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-control px-1 text-left text-[15px] font-semibold text-text hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:min-h-9"
        >
          <IconChevronRight className={`h-4 w-4 shrink-0 text-muted transition-transform duration-[var(--motion-duration)] ${recolhida ? "" : "rotate-90"}`} />
          {icone}
          <span className="min-w-0 truncate">{titulo}</span>
          <span className="shrink-0 text-[12px] font-normal text-muted tabular-nums">{quantidade}</span>
        </button>
        {acoes}
      </div>
      {!recolhida && <div className="animate-fade-in-up">{children}</div>}
    </section>
  );
}

/**
 * As SEÇÕES de quadros (como a página de quadros do Trello) — as MESMAS na tela de Tarefas e no "Mudar de quadros":
 * **Favoritos** · **Recentes** (deste aparelho) · **Seus quadros** = a `GradePastas` (as PASTAS e os quadros soltos, na
 * ordem da pessoa — abrir a pasta no lugar, arrastar para reordenar e para dentro/fora das pastas; com 2+ grupos, os chips
 * filtram por grupo). O `extraFinal` (ex.: o card "Novo quadro") entra no fim da grade. Toda seção MINIMIZA/MAXIMIZA pelo
 * título (guardado neste aparelho, igual nas duas telas).
 */
export function SecoesDeQuadros({
  quadros,
  favoritos,
  onFavorito,
  pastas,
  onMover,
  onEditarPasta,
  onExcluirPasta,
  ator,
  novoNaPasta,
  atual,
  aba,
  onAbrir,
  extraFinal,
}: {
  quadros: QuadroCardDados[];
  favoritos: number[];
  onFavorito?: (id: number) => void;
  pastas: PastasQuadros;
  onMover?: (raiz: string[], chave: string, destino: DestinoGrade) => void;
  onEditarPasta?: (c: ConjuntoQuadros) => void;
  onExcluirPasta?: (id: string, raiz: string[]) => void;
  /** Quem vê (as regras das pastas: a pública só editores organizam; a privada, o dono). */
  ator: AtorPasta;
  /** O card "Novo quadro" DENTRO de uma pasta que a pessoa organiza (`undefined` = sem). */
  novoNaPasta?: (c: ConjuntoQuadros) => ReactNode;
  atual?: number;
  aba?: string;
  onAbrir?: () => void;
  extraFinal?: ReactNode;
}) {
  const [recolhidas, alternar] = useSecoesRecolhidas();
  const recentes = useQuadrosRecentes();
  const [grupo, setGrupo] = useState("__tudo");
  const porId = new Map(quadros.map((q) => [q.id, q]));
  const favs = quadros.filter((q) => favoritos.includes(q.id));
  const recs = recentes.map((id) => porId.get(id)).filter((q): q is QuadroCardDados => !!q);
  const grupos = [...new Set(quadros.map((q) => q.grupoNome))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const filtrando = grupo !== "__tudo" && grupos.includes(grupo);
  const doGrupo = filtrando ? quadros.filter((q) => q.grupoNome === grupo) : quadros;
  const grade = { favoritos, onFavorito, atual, aba, onAbrir };
  const secao = (id: string, titulo: string, icone: ReactNode, quantidade: number, conteudo: ReactNode) => (
    <SecaoQuadros key={id} titulo={titulo} icone={icone} quantidade={quantidade} recolhida={recolhidas.has(id)} onAlternar={() => alternar(id)}>
      {conteudo}
    </SecaoQuadros>
  );
  const raizTodos = itensDaGrade(quadros, pastas).map((i) => i.chave);
  // A REGRA das pastas na tela (o servidor confere de novo): quem pode tirar/pôr cada quadro.
  const podeMover = (chave: string, destino: DestinoGrade): string | null => {
    if (!chave.startsWith("q:")) return null;
    const q = porId.get(Number(chave.slice(2)));
    if (!q) return null;
    const origem = pastas.lista.find((c) => c.quadros.includes(q.id)) ?? null;
    const alvo = destino.pasta != null ? (pastas.lista.find((c) => c.id === destino.pasta) ?? null) : null;
    if (!origem && !alvo) return null;
    // Da privada para fora, o dono decide ao soltar (tornar visível) — a confirmação vem depois.
    return motivoNaoMoverParaPasta(q, origem, alvo, ator, !!origem?.privado && !alvo?.privado);
  };
  return (
    <div className="space-y-5">
      {favs.length > 0 && secao("fav", "Favoritos", <IconEstrela className="h-4 w-4 shrink-0" style={{ color: "var(--warn)" }} fill="currentColor" />, favs.length, <GradeQuadros quadros={favs} {...grade} />)}
      {recs.length > 0 && secao("rec", "Visualizados recentemente", <IconClock className="h-4 w-4 shrink-0 text-muted" />, recs.length, <GradeQuadros quadros={recs} {...grade} />)}
      {secao(
        "todos",
        "Seus quadros",
        <IconLayers className="h-4 w-4 shrink-0 text-muted" />,
        doGrupo.length,
        <div className="space-y-3">
          {grupos.length > 1 && (
            <ChipsEscolha ariaLabel="Grupo" valor={filtrando ? grupo : "__tudo"} onEscolher={setGrupo} opcoes={[{ value: "__tudo", label: "Tudo" }, ...grupos.map((g) => ({ value: g, label: g }))]} />
          )}
          <GradePastas
            quadros={doGrupo}
            estado={pastas}
            ocultarVazias={filtrando}
            {...grade}
            extra={extraFinal}
            onMover={onMover}
            podeMover={podeMover}
            extraPasta={novoNaPasta && ((c) => (podeEditarPasta(c, ator) ? novoNaPasta(c) : null))}
            menuPasta={
              onEditarPasta && onExcluirPasta
                ? (c) => (podeEditarPasta(c, ator) ? <MenuConjunto conjunto={c} onEditar={() => onEditarPasta(c)} onExcluir={() => onExcluirPasta(c.id, raizTodos)} /> : null)
                : undefined
            }
          />
        </div>,
      )}
    </div>
  );
}

/** Uma pasta NOVA ainda sem id do servidor (`novo-…`). */
export const PASTA_NOVA = "novo-";
/** A pasta em branco do "Nova pasta" — a pública só para quem configura Tarefas (os demais criam a privada). */
export const pastaEmBranco = (ator: AtorPasta): ConjuntoQuadros => ({
  id: `${PASTA_NOVA}${Date.now().toString(36)}`,
  nome: "",
  cor: PALETA_ETIQUETAS[15],
  quadros: [],
  privado: !podePastaPublica(ator),
  criadoPor: ator.id,
  grupoId: 0,
});

/**
 * As PASTAS vistas pela pessoa (do banco — públicas do grupo + as privadas dela) e a ORDEM pessoal da raiz (preferência
 * `tarefas:conjuntos` = `{ordem}`). Tudo OTIMISTA e em FILA: mover na raiz grava só a ordem; mudar um quadro de pasta vai a
 * `POST /api/tarefas/pastas/mover` (entrar na PRIVADA confirma "vira privado"; sair dela pergunta se volta ao grupo);
 * salvar/excluir vão às rotas da pasta. Falhou ⇒ volta ao último estado gravado e avisa. `aoMudar` = recarregar os
 * quadros (a privacidade deles muda). Um `inicial` novo (recarga) vale quando a fila está parada.
 */
export function useConjuntosQuadros(inicial: PastasQuadros, { quadros, ator, aoMudar }: { quadros: QuadroCardDados[]; ator: AtorPasta; aoMudar?: () => void }) {
  const [estado, setEstado] = useState(inicial);
  const atual = useRef(inicial);
  const gravado = useRef(inicial);
  const fila = useRef<Promise<void>>(Promise.resolve());
  const pendentes = useRef(0);
  const reais = useRef(new Map<string, string>());
  const ctx = useRef({ quadros, aoMudar });
  ctx.current = { quadros, aoMudar };
  const { confirmar, confirmacao } = useConfirmacao();
  useEffect(() => {
    if (pendentes.current) return;
    atual.current = inicial;
    gravado.current = inicial;
    setEstado(inicial);
  }, [inicial]);
  // O id REAL de uma pasta criada nesta tela (a fila roda depois da criação).
  const real = (id: string) => reais.current.get(id) ?? id;
  const ordemReal = (ordem: string[]) => ordem.map((k) => (k.startsWith("p:") ? `p:${real(k.slice(2))}` : k));
  const gravarOrdem = (ordem: string[]) => chamar("/api/preferencias/tabela", "PUT", { chave: CHAVE_CONJUNTOS_TAREFAS, valor: { ordem: ordemReal(ordem) } });
  const trocarId = (e: PastasQuadros, de: string, para: string): PastasQuadros => ({
    lista: e.lista.map((c) => (c.id === de ? { ...c, id: para } : c)),
    ordem: e.ordem.map((k) => (k === `p:${de}` ? `p:${para}` : k)),
  });
  const enfileirar = (novo: PastasQuadros, tarefa: () => Promise<unknown>) => {
    atual.current = novo;
    setEstado(novo);
    pendentes.current++;
    fila.current = fila.current
      .then(tarefa)
      .then(
        () => {
          gravado.current = atual.current;
        },
        (e) => {
          atual.current = gravado.current;
          setEstado(gravado.current);
          toast.error((e as Error).message);
        },
      )
      .finally(() => {
        pendentes.current--;
      });
  };
  const mesmaOrdem = (a: string[], b: string[]) => a.length === b.length && a.every((k, i) => k === b[i]);

  const mover = async (raiz: string[], chave: string, destino: DestinoGrade) => {
    const antes = atual.current;
    const novo = moverNaGrade(antes, raiz, chave, destino);
    if (novo === antes) return;
    if (chave.startsWith("p:")) return enfileirar(novo, () => gravarOrdem(novo.ordem));
    const qid = Number(chave.slice(2));
    const origem = antes.lista.find((c) => c.quadros.includes(qid)) ?? null;
    const alvo = destino.pasta != null ? (antes.lista.find((c) => c.id === destino.pasta) ?? null) : null;
    if (!origem && !alvo) return enfileirar(novo, () => gravarOrdem(novo.ordem));
    const q = ctx.current.quadros.find((x) => x.id === qid);
    if (!q) return;
    let tornarPublico = false;
    if (origem?.privado && !alvo?.privado && q.privado && q.criadoPor === ator.id)
      tornarPublico = await confirmar({
        titulo: "Tornar o quadro visível ao grupo?",
        texto: alvo ? `Ele sai da pasta privada para a pasta pública "${alvo.nome}" — só entra nela visível ao grupo.` : "Ele saiu da pasta privada. Confirme para o grupo voltar a vê-lo; ou mantenha-o só seu.",
        confirmar: "Tornar visível",
        cancelar: alvo ? "Cancelar" : "Manter privado",
      });
    const motivo = motivoNaoMoverParaPasta(q, origem, alvo, ator, tornarPublico);
    if (motivo) return void toast.error(motivo);
    if (alvo?.privado && !q.privado && origem?.id !== alvo.id) {
      const ok = await confirmar({
        titulo: `O quadro "${q.nome}" vira privado`,
        texto: "Na pasta privada ele fica só seu: as outras pessoas saem das tarefas, equipes, eventos e checklists dele.",
        confirmar: "Pôr na pasta",
        perigo: true,
      });
      if (!ok) return;
    }
    // A fila pode ter mudado o estado enquanto a pergunta estava aberta: aplica sobre o ATUAL.
    const final = moverNaGrade(atual.current, raiz, chave, destino);
    const qidDe = (k: string | null | undefined) => (k?.startsWith("q:") ? Number(k.slice(2)) : null);
    enfileirar(final, async () => {
      await chamar("/api/tarefas/pastas/mover", "POST", {
        quadroId: qid,
        pastaId: alvo ? Number(real(alvo.id)) : null,
        antesDe: alvo ? qidDe(destino.antesDe) : null,
        depoisDe: alvo ? qidDe(destino.depoisDe) : null,
        tornarPublico,
      });
      if (!mesmaOrdem(final.ordem, antes.ordem)) await gravarOrdem(final.ordem);
      ctx.current.aoMudar?.();
    });
  };

  const salvar = (c: ConjuntoQuadros) => {
    const dele = new Set(c.quadros);
    const nova = c.id.startsWith(PASTA_NOVA);
    const lista = atual.current.lista.map((x) => (x.id === c.id ? c : { ...x, quadros: x.quadros.filter((q) => !dele.has(q)) }));
    enfileirar({ ...atual.current, lista: nova ? [...lista, c] : lista }, async () => {
      if (nova) {
        const j = await chamar<{ id: string }>("/api/tarefas/pastas", "POST", { nome: c.nome, cor: c.cor, privado: c.privado, quadros: c.quadros, grupoId: c.grupoId || null });
        reais.current.set(c.id, j.id);
        atual.current = trocarId(atual.current, c.id, j.id);
        setEstado(atual.current);
      } else await chamar(`/api/tarefas/pastas/${real(c.id)}`, "PATCH", { nome: c.nome, cor: c.cor, quadros: c.quadros });
      ctx.current.aoMudar?.();
    });
  };

  const excluir = (id: string, raiz: string[]) => {
    const novo = excluirPasta(atual.current, raiz, id);
    enfileirar(novo, async () => {
      await chamar(`/api/tarefas/pastas/${real(id)}`, "DELETE");
      await gravarOrdem(novo.ordem);
      ctx.current.aoMudar?.();
    });
  };

  return { estado, salvar, excluir, mover, confirmacao };
}

/** O menu "…" de uma PASTA: editar e excluir (com confirmação — os quadros voltam à grade, nenhum é tocado). */
export function MenuConjunto({ conjunto, onEditar, onExcluir }: { conjunto: ConjuntoQuadros; onEditar: () => void; onExcluir: () => void }) {
  const { confirmar, confirmacao } = useConfirmacao();
  return (
    <>
      <Dropdown align="end" width={220} ariaLabel={`Ações da pasta ${conjunto.nome}`} triggerClassName="h-11 w-11 shrink-0 justify-center rounded-control text-muted hover:bg-surface-2 lg:h-9 lg:w-9" trigger={<IconMais className="h-4 w-4" />}>
        {(fechar) => (
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => {
                fechar();
                onEditar();
              }}
              className="flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left text-[13px] text-text hover:bg-surface-2 lg:min-h-9"
            >
              <IconPencil className="h-4 w-4 text-muted" /> Editar pasta
            </button>
            <button
              type="button"
              onClick={async () => {
                fechar();
                if (
                  await confirmar({
                    titulo: `Excluir a pasta "${conjunto.nome}"?`,
                    texto: conjunto.privado ? "Só a pasta sai — os quadros dela voltam para a grade e continuam privados." : "Só a pasta sai — os quadros dela voltam para a grade, como estão (para todo o grupo).",
                    confirmar: "Excluir",
                    perigo: true,
                  })
                )
                  onExcluir();
              }}
              className="flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left text-[13px] hover:bg-surface-2 lg:min-h-9"
              style={{ color: "var(--danger)" }}
            >
              <IconTrash className="h-4 w-4" /> Excluir pasta
            </button>
          </div>
        )}
      </Dropdown>
      {confirmacao}
    </>
  );
}

/**
 * O EDITOR de uma PASTA (criar/editar): o NOME, a COR (os tons da paleta, em círculos), na CRIAÇÃO se é PRIVADA (os não
 * editores só criam a privada) e os QUADROS — só os que podem entrar (`motivoNaoMoverParaPasta`: na pública, os não
 * privados do grupo; na privada, os criados pela pessoa — os públicos avisam que viram privados), com o grupo de cada um;
 * o que está em OUTRA pasta mostra que sai de lá. Gravar devolve a pasta pronta.
 */
export function EditorConjunto({
  aberto,
  quadros,
  pastas = [],
  ator,
  onFechar,
  onSalvar,
}: {
  /** A pasta em edição (`null` = fechado). */
  aberto: ConjuntoQuadros | null;
  quadros: QuadroCardDados[];
  /** Todas as pastas (o aviso "sai da pasta X"). */
  pastas?: ConjuntoQuadros[];
  ator: AtorPasta;
  onFechar: () => void;
  onSalvar: (c: ConjuntoQuadros) => void;
}) {
  return (
    <Modal open={aberto != null} onClose={onFechar} titulo={aberto && !aberto.id.startsWith(PASTA_NOVA) ? "Editar pasta" : "Nova pasta"} size="md">
      {aberto && <FormConjunto key={aberto.id} inicial={aberto} quadros={quadros} pastas={pastas} ator={ator} onFechar={onFechar} onSalvar={onSalvar} />}
    </Modal>
  );
}

function FormConjunto({
  inicial,
  quadros,
  pastas,
  ator,
  onFechar,
  onSalvar,
}: {
  inicial: ConjuntoQuadros;
  quadros: QuadroCardDados[];
  pastas: ConjuntoQuadros[];
  ator: AtorPasta;
  onFechar: () => void;
  onSalvar: (c: ConjuntoQuadros) => void;
}) {
  const nova = inicial.id.startsWith(PASTA_NOVA);
  // Em que OUTRA pasta cada quadro está (um quadro fica em uma pasta só).
  const outra = new Map(pastas.filter((p) => p.id !== inicial.id).flatMap((p) => p.quadros.map((q) => [q, p] as const)));
  const [c, setC] = useState(inicial);
  const [busca, setBusca] = useState("");
  // O GRUPO da pasta: o dela; na nova, o do 1º quadro marcado (todos os quadros de uma pasta são do mesmo grupo).
  const grupoId = c.grupoId || quadros.find((q) => c.quadros.includes(q.id))?.grupoId || 0;
  const pode = (q: QuadroCardDados) => c.quadros.includes(q.id) || motivoNaoMoverParaPasta(q, outra.get(q.id) ?? null, { ...c, grupoId: grupoId || q.grupoId }, ator) == null;
  const elegiveis = quadros.filter(pode);
  const casa = predicadoBusca(busca);
  const visiveis = casa ? elegiveis.filter((q) => casa([q.nome, q.grupoNome])) : elegiveis;
  const marcar = (id: number) => setC((x) => ({ ...x, quadros: x.quadros.includes(id) ? x.quadros.filter((q) => q !== id) : [...x.quadros, id].slice(0, MAX_QUADROS_CONJUNTO) }));
  // Trocar pública ↔ privada (só na criação) tira os quadros que deixam de caber.
  const tipo = (privado: boolean) => setC((x) => ({ ...x, privado, quadros: [] }));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!c.nome.trim()) return;
        onSalvar({ ...c, nome: c.nome.trim(), grupoId });
        onFechar();
      }}
    >
      <TextField label="Nome da pasta" autoFocus value={c.nome} maxLength={MAX_NOME_CONJUNTO} placeholder="Ex.: PCA 2026, Rotinas, Protocolos" onChange={(e) => setC({ ...c, nome: e.target.value })} />
      {nova ? (
        <Switch
          checked={c.privado}
          onChange={tipo}
          disabled={!podePastaPublica(ator, grupoId)}
          label={
            <span>
              <span className="block font-semibold text-text">Pasta privada</span>
              <span className="block text-[12px] text-muted">
                {podePastaPublica(ator, grupoId)
                  ? "Só você vê a pasta; os quadros que entrarem ficam privados. Desligada, a pasta é de todo o grupo."
                  : "Só você vê a pasta; os quadros que entrarem ficam privados. Pastas do grupo só quem configura Tarefas cria."}
              </span>
            </span>
          }
        />
      ) : (
        <p className="flex items-center gap-2 text-[13px] text-muted">
          {c.privado ? <IconLock className="h-4 w-4 shrink-0" /> : <IconUsers className="h-4 w-4 shrink-0" />}
          {c.privado ? "Pasta privada — só você a vê; os quadros dela são privados." : "Pasta do grupo — todos os membros a veem; os editores a organizam."}
        </p>
      )}
      <fieldset>
        <legend className="mb-1.5 text-[13.5px] font-bold text-text">Cor</legend>
        <div className="flex flex-wrap gap-2">
          {PALETA_ETIQUETAS.slice(10, 20).map((cor) => (
            <button
              key={cor}
              type="button"
              aria-label={`Cor ${cor}`}
              aria-pressed={c.cor === cor}
              onClick={() => setC({ ...c, cor })}
              className="h-11 w-11 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:h-8 lg:w-8"
              style={{ background: cor, boxShadow: c.cor === cor ? "0 0 0 2px var(--surface), 0 0 0 4px var(--text)" : undefined }}
            />
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-[13.5px] font-bold text-text">
          Quadros <span className="font-normal text-muted">({c.quadros.length} na pasta)</span>
        </legend>
        <SearchField compacto placeholder="Buscar quadro" value={busca} onChange={(e) => setBusca(e.target.value)} onClear={() => setBusca("")} aria-label="Buscar quadro" />
        <div className="max-h-[40vh] space-y-0.5 overflow-y-auto rounded-control border border-border p-1">
          {visiveis.length ? (
            visiveis.map((q) => {
              const dentro = c.quadros.includes(q.id);
              const aviso = outra.has(q.id) ? (dentro ? `sai da pasta ${outra.get(q.id)?.nome}` : `na pasta ${outra.get(q.id)?.nome}`) : c.privado && !q.privado && dentro && !inicial.quadros.includes(q.id) ? "vira privado" : null;
              return (
                <div key={q.id} className="flex min-h-11 items-center rounded-control px-2 hover:bg-surface-2 lg:min-h-9">
                  <Checkbox
                    checked={dentro}
                    onChange={() => marcar(q.id)}
                    label={
                      <span className="flex min-w-0 items-center gap-2 text-[13px]">
                        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: q.cor }} />
                        <span className="truncate text-text">{q.nome}</span>
                        {q.privado && <IconLock aria-label="Privado" className="h-3.5 w-3.5 shrink-0 text-muted" />}
                        <span className="shrink-0 text-[11.5px] text-muted">{q.grupoNome}</span>
                        {aviso && (
                          <span className="shrink-0 text-[11.5px]" style={{ color: "var(--warn)" }}>
                            {aviso}
                          </span>
                        )}
                      </span>
                    }
                  />
                </div>
              );
            })
          ) : (
            <p className="px-2 py-4 text-center text-[13px] text-muted">{c.privado ? "Nenhum quadro criado por você." : "Nenhum quadro."}</p>
          )}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button variant="ghost" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!c.nome.trim()}>
          Salvar pasta
        </Button>
      </div>
    </form>
  );
}
