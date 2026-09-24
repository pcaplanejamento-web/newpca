"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { IconClose } from "./icons";

const TAMANHO = { md: "sm:max-w-md", lg: "sm:max-w-lg", xl: "sm:max-w-4xl", full: "sm:max-w-6xl" } as const;

/** Painel LATERAL (mestre-detalhe): um banner que aparece AO LADO do principal. */
export type ModalLateral = {
  /** Aberto = o painel desliza para o lado; fechado = colapsado. */
  aberto: boolean;
  titulo: string;
  /** Cabeçalho FIXO rico (ReactNode) — substitui o `titulo` textual no topo (ex.: nº + badges). */
  cabecalho?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
  /** Slot de botões à esquerda do X do lateral (ex.: cadeado de edição). */
  acoesCabecalho?: ReactNode;
  onClose: () => void;
};

/** Um painel da PILHA de banners (`paineis`): lateral com id estável e largura preferida (rem). */
export type ModalPainel = ModalLateral & {
  /** Identidade estável (a coluna do grid anima de 0 → largura ao abrir e de volta ao fechar). */
  id: string;
  /** Largura preferida (rem) — também o PESO da coluna quando dividem a tela. Padrão 40. */
  largura?: number;
};

/** Máximo de banners visíveis lado a lado no desktop (os mais antigos recolhem); no celular, 1. */
const MAX_VISIVEIS = 3;

/** Modais ABERTOS, na ordem de abertura — só o do TOPO reage ao Esc (um modal sobre outro, ex.:
 * relatório/reenvio sobre o banner do protocolo, não fecha os dois de uma vez). */
const modaisAbertos: number[] = [];
let seqModal = 0;

/** Duração do token de motion (ms) — 0 com "reduzir movimento"/motion desligado. */
export function duracaoMotionMs(): number {
  if (typeof window === "undefined") return 0;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--motion-duration").trim();
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) return 200;
  return v.endsWith("ms") ? n : n * 1000;
}

/** Card de um banner (cabeçalho fixo + corpo rolável + rodapé fixo). Reutilizado por todos os painéis. */
function Painel({
  titulo,
  cabecalho,
  onClose,
  rodape,
  bloqueado = false,
  acoesCabecalho,
  className = "",
  children,
}: {
  titulo: string;
  cabecalho?: ReactNode;
  onClose?: () => void;
  rodape?: ReactNode;
  bloqueado?: boolean;
  acoesCabecalho?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-soft sm:rounded-2xl ${className}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-[var(--pad-card)] py-3">
        {cabecalho ? (
          <div className="min-w-0 flex-1">{cabecalho}</div>
        ) : (
          <h3 className="min-w-0 truncate text-base font-bold text-text">{titulo}</h3>
        )}
        <div className="flex shrink-0 items-center gap-1">
          {acoesCabecalho}
          {onClose && !bloqueado && (
            <Button variant="icon" aria-label="Fechar" onClick={onClose}>
              <IconClose className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-[var(--pad-card)]">{children}</div>
      {rodape && <div className="shrink-0 border-t border-border bg-surface px-[var(--pad-card)] py-2.5">{rodape}</div>}
    </div>
  );
}

type Conteudo = Pick<ModalLateral, "titulo" | "cabecalho" | "rodape" | "acoesCabecalho" | "children">;

/**
 * Modal compartilhado: bottom-sheet no mobile ↔ painel centralizado no desktop.
 * Layout em coluna: **cabeçalho FIXO** + corpo rolável + **rodapé FIXO** opcional
 * (`rodape`, ex.: botões de ação). Fecha no Esc; o clique no fundo fecha só quando
 * `fecharNoBackdrop` (padrão). Com **`bloqueado`** (ex.: durante uma gravação em
 * andamento) NÃO fecha por nada — sem X, sem Esc, sem backdrop. Renderiza via
 * **portal em `document.body`** — assim o overlay `fixed` não é afetado por
 * ancestrais com `transform`/`overflow` (ex.: o painel do `Tabs`). Enquanto aberto,
 * **trava o scroll da página** (nada interage por trás). `acoesCabecalho` = slot de
 * botões à esquerda do X (ex.: cadeado de edição).
 *
 * **Pilha de banners** (`lateral`, `lateral2`, a lista `paineis` à DIREITA do principal e a lista
 * `esquerda` à ESQUERDA dele): as colunas seguem uma ORDEM FIXA (ex.: Protocolo | DFD | Item, qualquer
 * que seja o banner de entrada) e cada painel que abre surge NO SEU LUGAR — a trilha do grid cresce de 0
 * e os vizinhos deslizam (`grid-template-columns` + `max-width` animados pelo token de motion). No
 * desktop ficam até 3 lado a lado; no celular, só o ABERTO POR ÚLTIMO. O fechar é ANIMADO (simétrico
 * ao abrir) — o conteúdo fica montado até a transição terminar. Esc fecha o último aberto (pilha) e, por
 * último, o modal.
 */
export function Modal({
  open,
  onClose,
  titulo,
  cabecalho,
  size = "md",
  rodape,
  fecharNoBackdrop = true,
  bloqueado = false,
  acoesCabecalho,
  lateral,
  lateral2,
  paineis,
  esquerda,
  larguraPrincipal,
  principalNoTopo = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  titulo: string;
  /** Cabeçalho FIXO rico (ReactNode) — substitui o `titulo` textual no topo. */
  cabecalho?: ReactNode;
  size?: keyof typeof TAMANHO;
  rodape?: ReactNode;
  fecharNoBackdrop?: boolean;
  bloqueado?: boolean;
  acoesCabecalho?: ReactNode;
  lateral?: ModalLateral;
  /** 3º painel (à direita do `lateral`) — ex.: mensagens ao lado do DFD dentro do protocolo. */
  lateral2?: ModalLateral;
  /** Pilha GENÉRICA de painéis à direita do principal (substitui `lateral`/`lateral2`). */
  paineis?: ModalPainel[];
  /** Painéis à ESQUERDA do principal, na ordem das colunas (ex.: o principal é o Item e o DFD/protocolo
   * entram à esquerda dele — a ordem Protocolo | DFD | Item não muda com o banner de entrada). */
  esquerda?: ModalPainel[];
  /** Largura preferida (rem) do principal na pilha. Padrão: 64 sozinho, 44 com painéis ao lado. */
  larguraPrincipal?: number;
  /** O principal acabou de mostrar um painel FILHO (ex.: as mensagens do DFD no lugar do item): conta como
   * o ÚLTIMO aberto — é o visível no celular e o 1º que o Esc fecha (o `onClose` dele volta um passo). */
  principalNoTopo?: boolean;
  children: ReactNode;
}) {
  const [montado, setMontado] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const idModal = useRef(0);
  if (idModal.current === 0) idModal.current = ++seqModal;
  useEffect(() => setMontado(true), []);
  // Registra na pilha de modais abertos (o do topo é o único que atende ao Esc).
  useEffect(() => {
    if (!open) return;
    const id = idModal.current;
    modaisAbertos.push(id);
    return () => {
      const i = modaisAbertos.lastIndexOf(id);
      if (i >= 0) modaisAbertos.splice(i, 1);
    };
  }, [open]);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const on = () => setIsDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Trava o scroll da página enquanto o modal está aberto (nada interage por trás).
  useEffect(() => {
    if (!open) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [open]);

  // Painéis efetivos: à direita (`paineis` ou os legados `lateral`/`lateral2`) + os da `esquerda`.
  const direita: ModalPainel[] =
    paineis ??
    [lateral ? { ...lateral, id: "lateral" } : null, lateral2 ? { ...lateral2, id: "lateral2" } : null].filter(
      (p): p is ModalPainel => p != null,
    );
  const aEsquerda = esquerda ?? [];
  const pilha = [...aEsquerda, ...direita];
  const abertosIds = pilha.filter((p) => p.aberto).map((p) => p.id);
  const chaveAbertos = abertosIds.join("|");
  const abertosRef = useRef<string[]>(abertosIds);
  abertosRef.current = abertosIds;
  // ORDEM DE ABERTURA (o último aberto é o "do topo"): decide o visível no celular e o Esc. Contabilidade
  // idempotente — tira quem fechou e acrescenta quem abriu (na ordem das colunas, se vários de uma vez).
  const ordemRef = useRef<string[]>([]);
  {
    const abertos = new Set(abertosIds);
    const ordem = ordemRef.current.filter((id) => abertos.has(id));
    for (const id of abertosIds) if (!ordem.includes(id)) ordem.push(id);
    ordemRef.current = ordem;
  }

  // Mantém montado o painel que está FECHANDO (fecha animado): guarda o último conteúdo de cada painel
  // aberto e só desmonta os fechados quando a transição do grid termina (ou, sem transição — motion
  // desligado —, pelo tempo do token).
  const cache = useRef(new Map<string, Conteudo>());
  const [montados, setMontados] = useState<Set<string>>(new Set());
  for (const p of pilha) {
    if (p.aberto) cache.current.set(p.id, { titulo: p.titulo, cabecalho: p.cabecalho, rodape: p.rodape, acoesCabecalho: p.acoesCabecalho, children: p.children });
  }
  const desmontarFechados = () =>
    setMontados((m) => {
      const abertosAgora = new Set(abertosRef.current);
      const n = new Set([...m].filter((id) => abertosAgora.has(id)));
      return n.size === m.size ? m : n;
    });
  // biome-ignore lint/correctness/useExhaustiveDependencies: reage só à lista de abertos (chave estável).
  useEffect(() => {
    if (!open) {
      setMontados(new Set());
      cache.current.clear(); // fechou o modal todo — não guarda os painéis antigos
      return;
    }
    setMontados((m) => {
      const faltando = abertosRef.current.filter((id) => !m.has(id));
      return faltando.length === 0 ? m : new Set([...m, ...faltando]);
    });
    const t = window.setTimeout(desmontarFechados, duracaoMotionMs() + 80);
    return () => window.clearTimeout(t);
  }, [chaveAbertos, open]);

  // Esc fecha o ÚLTIMO painel aberto (pilha) e, por último, o modal — lê a pilha/onClose ATUAIS (ref):
  // o ouvinte é registrado uma vez por abertura, não a cada render.
  const escRef = useRef({ pilha, onClose, principalNoTopo });
  escRef.current = { pilha, onClose, principalNoTopo };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || bloqueado) return;
      if (modaisAbertos[modaisAbertos.length - 1] !== idModal.current) return; // há outro modal por cima
      if (escRef.current.principalNoTopo) return escRef.current.onClose(); // o principal está por cima
      const idUltimo = ordemRef.current[ordemRef.current.length - 1];
      const ultimo = escRef.current.pilha.find((p) => p.id === idUltimo && p.aberto);
      if (ultimo) ultimo.onClose();
      else escRef.current.onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, bloqueado]);

  if (!open || !montado) return null;

  const scrim = (
    <div
      className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm"
      onClick={fecharNoBackdrop && !bloqueado ? onClose : undefined}
    />
  );

  // Modo simples (1 banner) — comportamento original, inalterado.
  if (pilha.length === 0) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-[var(--pad-canvas)]">
        {scrim}
        <Painel
          titulo={titulo}
          cabecalho={cabecalho}
          onClose={onClose}
          rodape={rodape}
          bloqueado={bloqueado}
          acoesCabecalho={acoesCabecalho}
          className={TAMANHO[size]}
        >
          {children}
        </Painel>
      </div>,
      document.body,
    );
  }

  // Colunas na ORDEM FIXA: esquerda | principal | direita. VISÍVEIS = os ABERTOS POR ÚLTIMO (até 3 no
  // desktop, 1 no celular) — sempre desenhados na ordem das colunas.
  const PRINCIPAL = "__principal";
  const colunas = [...aEsquerda, { id: PRINCIPAL, aberto: true, largura: larguraPrincipal }, ...direita];
  const porAbertura = principalNoTopo ? [...ordemRef.current, PRINCIPAL] : [PRINCIPAL, ...ordemRef.current];
  const visiveis = new Set(porAbertura.slice(-(isDesktop ? MAX_VISIVEIS : 1)));
  const largura = (c: { id: string; largura?: number }) =>
    c.largura ?? (c.id === PRINCIPAL ? (visiveis.size > 1 ? 44 : 64) : 40);
  // Mesma ESTRUTURA de trilha aberta/fechada (minmax(0, Nfr)) — o navegador interpola a largura.
  const cols = colunas.map((c) => `minmax(0,${visiveis.has(c.id) ? largura(c) : 0}fr)`).join(" ");
  // Soma das colunas visíveis + os vãos entre elas (o token `--gap-block`, o MESMO do `gap` do grid).
  const maxW = !isDesktop
    ? "100%"
    : `calc(${colunas.filter((c) => visiveis.has(c.id)).reduce((t, c) => t + largura(c), 0)}rem + ${visiveis.size - 1} * var(--gap-block))`;
  /** A coluna de UM painel da pilha (montada enquanto aberta ou fechando — fecha animado). */
  const colunaPainel = (p: ModalPainel) => {
    const conteudo = p.aberto ? p : cache.current.get(p.id);
    const mostrar = (p.aberto || montados.has(p.id)) && conteudo;
    return (
      <div key={p.id} className="min-w-0 overflow-hidden" inert={!visiveis.has(p.id)}>
        {mostrar && (
          <Painel
            titulo={conteudo.titulo}
            cabecalho={conteudo.cabecalho}
            onClose={p.onClose}
            rodape={conteudo.rodape}
            acoesCabecalho={conteudo.acoesCabecalho}
            bloqueado={bloqueado}
          >
            {conteudo.children}
          </Painel>
        )}
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-[var(--pad-canvas)]">
      {scrim}
      <div
        className="grid w-full items-end gap-0 sm:items-start sm:gap-[var(--gap-block)]"
        style={{
          maxWidth: maxW,
          gridTemplateColumns: cols,
          transition:
            "grid-template-columns var(--motion-duration) var(--motion-ease), max-width var(--motion-duration) var(--motion-ease)",
        }}
        onTransitionEnd={(e) => {
          // Transição do grid terminou: desmonta os painéis que FECHARAM (os abertos seguem montados).
          if (e.target === e.currentTarget && e.propertyName === "grid-template-columns") desmontarFechados();
        }}
      >
        {aEsquerda.map(colunaPainel)}
        <div className="min-w-0 overflow-hidden" inert={!visiveis.has(PRINCIPAL)}>
          <Painel
            titulo={titulo}
            cabecalho={cabecalho}
            onClose={onClose}
            rodape={rodape}
            bloqueado={bloqueado}
            acoesCabecalho={acoesCabecalho}
          >
            {children}
          </Painel>
        </div>
        {direita.map(colunaPainel)}
      </div>
    </div>,
    document.body,
  );
}
