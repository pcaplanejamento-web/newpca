"use client";

import { cloneElement, type ReactElement, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { IconClose } from "./icons";
import { rotuloCamada } from "@/lib/camadas-core";
import { useArrastoCamadas } from "./useArrastoCamadas";
import { useArrastoFechar } from "./useArrastoFechar";
import { useSaida } from "./useSaida";

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

/** Trava do scroll da página COMPARTILHADA por todos os modais: trava no 1º aberto e solta só quando o ÚLTIMO fecha — um
 * modal que fecha fora de ordem (o de baixo antes do de cima) nunca destrava a página sob outro nem a deixa travada. */
let travasScroll = 0;
let overflowAntes = "";
/** Também marca `data-modal-aberto` no `<html>`: as bolhas do chat e a pílula do segundo plano (acima do z do modal)
 * somem enquanto houver um modal/folha/gaveta aberto — senão cobrem os botões do rodapé da folha no celular. */
export function travarScroll(): () => void {
  if (travasScroll++ === 0) {
    overflowAntes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.dataset.modalAberto = "";
  }
  return () => {
    if (travasScroll > 0 && --travasScroll === 0) {
      document.body.style.overflow = overflowAntes;
      delete document.documentElement.dataset.modalAberto;
    }
  };
}

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
  // No celular (folha que sobe de baixo): arrastar a alça/o cabeçalho para baixo fecha.
  const ref = useRef<HTMLDivElement>(null);
  useArrastoFechar(ref, { direcao: "baixo", onFechar: onClose, ativo: !bloqueado, midia: "(max-width: 39.999rem)" });
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-soft sm:rounded-2xl ${className}`}
    >
      {/* No celular as AÇÕES do cabeçalho (Histórico, Tarefas, Atualizar…) descem para uma 2ª linha: o título (nº, tipo,
          planejamento) fica inteiro e o X segue no canto. */}
      {onClose && !bloqueado && (
        <div data-alca-fechar aria-hidden="true" className="flex shrink-0 touch-none justify-center pt-2 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-border-2" />
        </div>
      )}
      <div
        data-alca-fechar={onClose && !bloqueado ? "" : undefined}
        className="flex shrink-0 flex-wrap items-center justify-between gap-x-1 gap-y-1.5 border-b border-border p-[var(--pad-card)] max-sm:touch-none"
      >
        {cabecalho ? (
          <div className="mr-2 min-w-0 flex-1">{cabecalho}</div>
        ) : (
          <h3 className="mr-2 line-clamp-2 min-w-0 flex-1 text-base font-bold text-text sm:line-clamp-1" title={titulo}>
            {titulo}
          </h3>
        )}
        {acoesCabecalho && <div className="flex items-center gap-1 max-sm:order-3 max-sm:w-full max-sm:flex-wrap max-sm:justify-end sm:shrink-0">{acoesCabecalho}</div>}
        {onClose && !bloqueado && (
          <Button variant="icon" aria-label="Fechar" onClick={onClose} className="shrink-0 max-sm:order-2">
            <IconClose className="h-5 w-5" />
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-[var(--pad-card)]">{children}</div>
      {rodape && (
        <div className="shrink-0 border-t border-border bg-surface p-[var(--pad-card)] max-sm:pb-[calc(var(--pad-card)_+_env(safe-area-inset-bottom))]">{rodape}</div>
      )}
    </div>
  );
}

/** Uma CAMADA do carrossel do celular: o rótulo do navegador e o painel. */
type Camada = { id: string; rotulo: string; painel: ReactNode };

/**
 * CAMADAS NO CELULAR (abaixo do `lg`): os banners da pilha (Protocolo · DFD · Item, histórico…) não cabem lado a lado —
 * ficam num CARROSSEL na ordem fixa das colunas, com o NAVEGADOR flutuante acima da folha (um botão por camada; o
 * indicador desliza até a atual). Tocar num botão leva à camada; deslizar o dedo de lado também (o trilho segue o dedo,
 * com resistência nas pontas). Uma camada nova entra deslizando; a fechada sai e a anterior volta. Sem movimento
 * (sistema ou o ADM), as trocas são instantâneas (a rede de segurança do `globals.css`).
 */
function CamadasCelular({ camadas, ativa, onAtiva }: { camadas: Camada[]; ativa: string; onAtiva: (id: string) => void }) {
  const idx = Math.max(0, camadas.findIndex((c) => c.id === ativa));
  const [arrasto, setArrasto] = useState<number | null>(null);
  const trilho = useRef<HTMLDivElement>(null);
  useArrastoCamadas(trilho, {
    indice: idx,
    total: camadas.length,
    onMover: setArrasto,
    onTrocar: (i) => onAtiva(camadas[i].id),
  });
  // Lista mudou e a camada à vista é a MESMA (outra abriu/fechou ao lado): reposiciona sem animar — nada se mexe na tela.
  const anterior = useRef({ ativa, idx, n: 0 });
  const semTransicao = anterior.current.ativa === ativa && anterior.current.idx !== idx;
  // A camada à vista TROCOU sem o trilho andar (um banner novo entrou no lugar dela, à esquerda ou à direita): ela entra
  // deslizando do lado de onde veio.
  const antes = camadas.findIndex((c) => c.id === anterior.current.ativa);
  const trocouNoLugar = anterior.current.ativa !== ativa && anterior.current.idx === idx;
  const entrada = useRef<{ id: string; lado: "esq" | "dir"; n: number } | null>(null);
  if (trocouNoLugar) entrada.current = { id: ativa, lado: antes >= 0 && antes < idx ? "dir" : "esq", n: anterior.current.n + 1 };
  anterior.current = { ativa, idx, n: entrada.current?.n ?? anterior.current.n };
  // A entrada pela Web Animations API (o conteúdo NUNCA remonta — um rascunho aberto no banner continua).
  const nEntrada = entrada.current?.n ?? 0;
  useLayoutEffect(() => {
    const e = entrada.current;
    if (!e || nEntrada === 0) return;
    const el = trilho.current?.querySelector<HTMLElement>(`[data-slot-camada="${CSS.escape(e.id)}"]`);
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "off") return;
    el.animate([{ opacity: 0.4, translate: `${e.lado === "dir" ? 38 : -38}% 0` }, { opacity: 1, translate: "0 0" }], {
      duration: duracaoMotionMs(),
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    });
  }, [nEntrada]);
  // O indicador do navegador: as posições/larguras de TODOS os botões (medidas; de novo quando o navegador muda de
  // tamanho) — durante o arrasto ele anda entre a camada atual e a vizinha na mesma fração do dedo.
  const nav = useRef<HTMLDivElement>(null);
  const [botoes, setBotoes] = useState<{ x: number; w: number }[]>([]);
  const chaveLista = camadas.map((c) => `${c.id}:${c.rotulo}`).join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: remede quando a lista muda.
  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    const medir = () => {
      const bs = [...el.querySelectorAll<HTMLElement>("[data-camada]")].map((b) => ({ x: b.offsetLeft, w: b.offsetWidth }));
      setBotoes((a) => (a.length === bs.length && a.every((v, i) => v.x === bs[i].x && v.w === bs[i].w) ? a : bs));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [chaveLista]);
  const largura = trilho.current?.clientWidth || 1;
  const fracao = arrasto == null ? 0 : Math.max(-1, Math.min(1, -arrasto / largura));
  const viz = Math.max(0, Math.min(botoes.length - 1, idx + Math.sign(fracao)));
  const marca =
    botoes[idx] && botoes[viz]
      ? {
          x: botoes[idx].x + (botoes[viz].x - botoes[idx].x) * Math.abs(fracao),
          w: botoes[idx].w + (botoes[viz].w - botoes[idx].w) * Math.abs(fracao),
        }
      : null;
  const variasCamadas = camadas.length > 1;
  // Uma camada só: a folha de sempre (rente às bordas, sem navegador). Várias: a área tem a altura fixa (92dvh) — a folha
  // ocupa o que sobra acima do navegador — e TODO espaço é o padrão do sistema (`--pad-canvas`): as folhas das bordas da
  // tela e entre si (no deslize), a folha do navegador e o navegador do fim da tela (+ a área segura). A ÁRVORE é a mesma
  // nos dois casos (só as classes mudam): abrir a 2ª camada nunca remonta a 1ª (um rascunho aberto continua).
  return (
    <div
      className={`modal-corpo flex w-full flex-col ${variasCamadas ? "h-[92dvh] gap-[var(--pad-canvas)] pb-[calc(var(--pad-canvas)+env(safe-area-inset-bottom))]" : ""}`}
    >
      <div ref={trilho} className={`w-full touch-pan-y overflow-hidden ${variasCamadas ? "min-h-0 flex-1" : ""}`}>
        <div
          className={`flex ${variasCamadas ? "h-full" : "items-end"}`}
          style={{
            transform: `translate3d(calc(${-idx * 100}% + ${arrasto ?? 0}px), 0, 0)`,
            transition: arrasto != null || semTransicao ? "none" : "transform var(--motion-duration) cubic-bezier(0.2, 0.8, 0.2, 1)",
          }}
        >
          {camadas.map((c) => (
            <div
              key={c.id}
              data-slot-camada={c.id}
              className={`flex w-full shrink-0 ${variasCamadas ? "h-full px-[var(--pad-canvas)] [&>[role=dialog]]:h-full [&>[role=dialog]]:max-h-full [&>[role=dialog]]:rounded-2xl" : "items-end"}`}
              inert={c.id !== ativa}
            >
              {c.painel}
            </div>
          ))}
        </div>
      </div>
      <div className={`w-full shrink-0 px-[var(--pad-canvas)] ${variasCamadas ? "" : "hidden"}`}>
        <div
          ref={nav}
          role="tablist"
          aria-label="Banners abertos"
          className="relative flex w-full items-stretch gap-1 rounded-full border border-border bg-surface p-1 shadow-flutuante"
        >
          {marca && (
            <span
              aria-hidden="true"
              className={`absolute top-1 bottom-1 rounded-full bg-accent-soft ring-1 ring-accent/30 ${arrasto == null ? "transition-[left,width] duration-[var(--motion-duration)] ease-[cubic-bezier(0.2,0.8,0.2,1)]" : ""}`}
              style={{ left: marca.x, width: marca.w }}
            />
          )}
          {camadas.map((c, i) => {
            const r = rotuloCamada(c.rotulo);
            const atual = c.id === ativa;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                data-camada={c.id}
                aria-selected={atual}
                aria-label={`${i + 1}. ${c.rotulo}`}
                title={c.rotulo}
                onClick={() => onAtiva(c.id)}
                className="relative z-10 flex h-11 min-w-0 flex-1 items-center justify-center rounded-full px-2"
              >
                <span aria-hidden="true" className="flex min-w-0 max-w-full flex-col items-center text-center leading-tight">
                  <span className={`max-w-full truncate text-[12px] font-semibold transition-colors duration-[var(--motion-duration)] ${atual ? "text-accent" : "text-text"}`}>{r.tipo}</span>
                  {r.detalhe && <span className="max-w-full truncate text-[11px] tabular-nums text-muted">{r.detalhe}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
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
  const [largo, setLargo] = useState(false);
  const idModal = useRef(0);
  if (idModal.current === 0) idModal.current = ++seqModal;
  useEffect(() => setMontado(true), []);
  // A SAÍDA animada: fechado, o último desenho fica por `--motion-fast` com `data-saindo` (o fundo esmaece e o banner
  // desce/encolhe) — sem cliques nesse instante.
  const { saindo } = useSaida(open);
  const ultimo = useRef<ReactElement<{ "data-saindo"?: string }> | null>(null);
  const portal = (el: ReactElement<{ "data-saindo"?: string }>) => {
    ultimo.current = el;
    return createPortal(el, document.body);
  };
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
    // Vários banners lado a lado só a partir do `lg`: no tablet (768) três painéis ficavam com ~250px cada e os
    // formulários deles (que quebram pela largura da TELA) espremidos.
    const lg = window.matchMedia("(min-width: 64rem)");
    const on = () => {
      setIsDesktop(mq.matches);
      setLargo(lg.matches);
    };
    on();
    mq.addEventListener("change", on);
    lg.addEventListener("change", on);
    return () => {
      mq.removeEventListener("change", on);
      lg.removeEventListener("change", on);
    };
  }, []);

  // Trava o scroll da página enquanto o modal está aberto (nada interage por trás) — contagem compartilhada.
  useEffect(() => (open ? travarScroll() : undefined), [open]);

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

  // CELULAR: a camada à vista no carrossel (escolhida pela pessoa no navegador ou deslizando). Volta ao ÚLTIMO aberto
  // quando a lista de abertos muda (abriu um banner novo = ele vem à vista; fechou = o anterior).
  const chaveFoco = `${chaveAbertos}#${principalNoTopo ? 1 : 0}`;
  const [foco, setFoco] = useState<{ chave: string; id: string } | null>(null);
  const focoAtual = foco?.chave === chaveFoco ? foco.id : null;

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
      if (e.key !== "Escape" || bloqueado || e.defaultPrevented) return; // consumido (ex.: fechou um filtro aberto)
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

  if (!open && saindo && montado && ultimo.current) return createPortal(cloneElement(ultimo.current, { "data-saindo": "" }), document.body);
  if (!open || !montado) {
    if (!open) ultimo.current = null;
    return null;
  }

  const scrim = (
    <div
      aria-hidden="true"
      className="modal-fundo absolute inset-0 bg-[var(--scrim)] lg:backdrop-blur-sm"
      onClick={fecharNoBackdrop && !bloqueado ? onClose : undefined}
    />
  );

  // Modo simples (1 banner) — comportamento original, inalterado.
  if (pilha.length === 0) {
    return portal(
      <div
        className={`modal-raiz fixed inset-0 z-50 flex items-end justify-center p-0 sm:p-[var(--pad-canvas)] sm:items-center`}
      >
        {scrim}
        <Painel
          titulo={titulo}
          cabecalho={cabecalho}
          onClose={onClose}
          rodape={rodape}
          bloqueado={bloqueado}
          acoesCabecalho={acoesCabecalho}
          className={`modal-corpo ${TAMANHO[size]}`}
        >
          {children}
        </Painel>
      </div>,
    );
  }

  // Colunas na ORDEM FIXA: esquerda | principal | direita. VISÍVEIS = os ABERTOS POR ÚLTIMO (até 3 no
  // desktop, 1 no celular) — sempre desenhados na ordem das colunas.
  const PRINCIPAL = "__principal";
  const colunas = [...aEsquerda, { id: PRINCIPAL, aberto: true, largura: larguraPrincipal }, ...direita];
  const porAbertura = principalNoTopo ? [...ordemRef.current, PRINCIPAL] : [PRINCIPAL, ...ordemRef.current];
  const visiveis = new Set(porAbertura.slice(-(largo ? MAX_VISIVEIS : 1)));
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

  // CELULAR e telas menores: os banners não cabem lado a lado — um CARROSSEL de camadas com o navegador flutuante.
  if (!largo) {
    const ultimoId = porAbertura[porAbertura.length - 1];
    const ativa = focoAtual ?? ultimoId;
    const camadas: Camada[] = colunas
      .filter((c) => c.id === PRINCIPAL || c.aberto)
      .map((c) => {
        if (c.id === PRINCIPAL)
          return {
            id: PRINCIPAL,
            rotulo: titulo,
            painel: (
              <Painel titulo={titulo} cabecalho={cabecalho} onClose={onClose} rodape={rodape} bloqueado={bloqueado} acoesCabecalho={acoesCabecalho}>
                {children}
              </Painel>
            ),
          };
        const p = pilha.find((x) => x.id === c.id) as ModalPainel;
        return {
          id: p.id,
          rotulo: p.titulo,
          painel: (
            <Painel titulo={p.titulo} cabecalho={p.cabecalho} onClose={p.onClose} rodape={p.rodape} acoesCabecalho={p.acoesCabecalho} bloqueado={bloqueado}>
              {p.children}
            </Painel>
          ),
        };
      });
    return portal(
      <div className="modal-raiz fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-[var(--pad-canvas)]">
        {scrim}
        <div className="relative w-full sm:max-w-2xl">
          <CamadasCelular camadas={camadas} ativa={ativa} onAtiva={(id) => setFoco({ chave: chaveFoco, id })} />
        </div>
      </div>,
    );
  }

  return portal(
    <div className="modal-raiz fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-[var(--pad-canvas)]">
      {scrim}
      <div
        className="modal-corpo grid w-full items-end gap-0 sm:items-start sm:gap-[var(--gap-block)]"
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
  );
}
