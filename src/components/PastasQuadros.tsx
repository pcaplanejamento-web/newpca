"use client";

import { type KeyboardEvent, type ReactNode, type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { num } from "@/lib/format";
import type { QuadroCard as QuadroCardDados } from "@/lib/tarefas";
import { type ConjuntoQuadros, type DestinoGrade, type ItemGrade, itensDaGrade, type PastasQuadros } from "@/lib/tarefas-core";
import { CartaoPreso } from "./ArrastoCartoes";
import { IconChevronRight, IconPasta, IconClose, IconPastaAberta } from "./icons";
import { duracaoMotionMs } from "./Modal";
import { CapaQuadro, QuadroCard } from "./QuadroCard";
import { segurar } from "./segurar";

/** A grade das pastas/quadros: colunas de no mínimo 15rem (a MESMA da `GradeQuadros` — o card nunca muda de forma). */
const GRADE = "grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3";

/**
 * O card de uma PASTA de quadros — a MESMA moldura e altura do `QuadroCard` (a capa 16:9 + o bloco de texto): na capa,
 * o MOSAICO das capas de até 4 quadros dela sobre a cor da pasta; embaixo, "Pasta", o nome e as contagens (quadros ·
 * abertas · atrasadas). Tocar ABRE/FECHA a pasta no lugar. `alvo` = um quadro arrastado sobre ela (soltar põe dentro);
 * `recebeu` = o pulso de quando um quadro entra. `menu` = as ações (editar/excluir), fora do botão.
 */
export function PastaQuadro({
  pasta,
  quadros,
  aberta = false,
  alvo = false,
  recebeu = false,
  onAlternar,
  menu,
}: {
  pasta: ConjuntoQuadros;
  quadros: Pick<QuadroCardDados, "id" | "cor" | "fundoUrl" | "fundoAjuste" | "fundoGradiente" | "abertas" | "atrasadas" | "arquivado">[];
  aberta?: boolean;
  alvo?: boolean;
  recebeu?: boolean;
  onAlternar?: () => void;
  menu?: ReactNode;
}) {
  const abertas = quadros.reduce((s, q) => s + (q.arquivado ? 0 : q.abertas), 0);
  const atrasadas = quadros.reduce((s, q) => s + (q.arquivado ? 0 : q.atrasadas), 0);
  const Icone = aberta ? IconPastaAberta : IconPasta;
  return (
    <div className={`relative h-full ${recebeu ? "animate-pasta-recebe" : ""}`}>
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberta}
        aria-label={`${aberta ? "Fechar" : "Abrir"} a pasta ${pasta.nome} (${quadros.length} ${quadros.length === 1 ? "quadro" : "quadros"})`}
        className={`group flex h-full w-full flex-col overflow-hidden rounded-card border bg-surface p-2 text-left shadow-ring transition-[border-color,box-shadow,background-color] duration-[var(--motion-duration)] hover:border-accent/50 focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/25 ${
          alvo ? "border-accent ring-4 ring-accent/30" : aberta ? "border-accent ring-2 ring-accent" : "border-border"
        }`}
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-lg p-1.5" style={{ background: `color-mix(in srgb, ${pasta.cor} 24%, var(--surface-2))` }}>
          <div className="grid h-full grid-cols-2 grid-rows-2 gap-1">
            {Array.from({ length: 4 }, (_, i) => {
              const q = quadros[i];
              return q ? (
                <div key={q.id} className="min-h-0 overflow-hidden rounded-md [&>div]:!aspect-auto [&>div]:h-full [&>div]:rounded-md">
                  <CapaQuadro quadro={q} />
                </div>
              ) : (
                <div key={`v${i}`} aria-hidden className="rounded-md border border-dashed" style={{ borderColor: `color-mix(in srgb, ${pasta.cor} 45%, transparent)` }} />
              );
            })}
          </div>
          <span aria-hidden className="absolute bottom-1.5 left-1.5 grid h-7 w-7 place-items-center rounded-md text-white shadow-soft" style={{ background: pasta.cor }}>
            <Icone className="h-4 w-4" />
          </span>
          {alvo && <span className="absolute inset-0 grid place-items-center bg-accent/15 text-[12px] font-semibold text-accent">Soltar na pasta</span>}
        </div>
        <div className="flex flex-1 flex-col px-1.5 pt-2 pb-1">
          <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
            Pasta
            <IconChevronRight className={`h-3 w-3 transition-transform duration-[var(--motion-duration)] ${aberta ? "-rotate-90" : "rotate-90"}`} />
          </span>
          <h3 className="mt-0.5 line-clamp-2 min-h-[2.5em] text-[14px] font-semibold leading-snug text-text group-hover:text-accent" title={pasta.nome}>
            {pasta.nome}
          </h3>
          <dl className="mt-auto grid grid-cols-3 gap-x-2 border-t border-border pt-2 text-[11px]">
            <div className="min-w-0">
              <dt className="truncate text-muted">Quadros</dt>
              <dd className="text-[15px] font-bold tabular-nums text-text">{num(quadros.length)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="truncate text-muted">Abertas</dt>
              <dd className="text-[15px] font-bold tabular-nums text-text">{num(abertas)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="truncate text-muted">Atrasadas</dt>
              <dd className="text-[15px] font-bold tabular-nums" style={{ color: atrasadas ? "var(--danger)" : "var(--text-2)" }}>
                {num(atrasadas)}
              </dd>
            </div>
          </dl>
        </div>
      </button>
      {menu && <div className="absolute top-3 right-3 rounded-control bg-surface/90 shadow-ring backdrop-blur-sm lg:top-3.5 lg:right-3.5">{menu}</div>}
    </div>
  );
}

/** Para onde o item arrastado vai: uma área (`null` = a raiz; senão, a pasta aberta) + o vizinho VISÍVEL — ou DENTRO de uma pasta. */
type DestinoArrasto = { area: string | null; antesDe: string | null; depoisDe: string | null; dentro: string | null };
export type ArrastoGrade = {
  chave: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  largura: number;
  altura: number;
  destino: DestinoArrasto;
  pousando?: boolean;
  entrando?: boolean;
};

const LIMIAR = 6;
const TOQUE_MS = 400;
const BORDA = 64;
const VEL = 14;
const chaveDestino = (d: DestinoArrasto) => `${d.area}|${d.antesDe}|${d.depoisDe}|${d.dentro}`;

/** O contêiner que ROLA acima do elemento (o corpo de um modal), ou `null` = a página. */
function rolagemDe(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}

/**
 * ARRASTAR os cards de uma GRADE (pastas e quadros) — o MESMO padrão do arrasto dos cartões do quadro (`ArrastoCartoes`):
 * ouvintes na JANELA, começa depois de 6px (no TOQUE, depois de SEGURAR ~400 ms — mexer antes rola a tela), `segurar()`,
 * o card PRESO anda no DOM (`translate3d`) e só o DESTINO re-renderiza, a tela rola sozinha perto das bordas e, ao
 * soltar, o card POUSA no lugar sombreado (ou ENCOLHE para dentro da pasta) antes de a ordem mudar. O clique logo depois
 * do arrasto é engolido. O DOM: `[data-grade-area]` (a raiz = "", a pasta aberta = o id) › `[data-grade-item]`;
 * `[data-pasta-id]` = o card da pasta; `[data-painel-pasta]` = o painel da pasta aberta.
 */
export function useArrastoGrade({ raiz, onSoltar }: { raiz: RefObject<HTMLElement | null>; onSoltar?: (chave: string, destino: DestinoArrasto) => void }) {
  const [arrasto, setArrasto] = useState<ArrastoGrade | null>(null);
  const fantasma = useRef<HTMLDivElement>(null);
  const encerrar = useRef<(() => void) | null>(null);
  const arrastou = useRef(false);
  useEffect(() => () => encerrar.current?.(), []);

  const iniciar = (e: ReactPointerEvent<HTMLElement>, chave: string) => {
    if (!onSoltar || !e.isPrimary || e.button > 0 || arrasto?.pousando) return;
    const item = e.currentTarget;
    const grade = raiz.current;
    if (!grade) return;
    encerrar.current?.();
    arrastou.current = false;
    const toque = e.pointerType === "touch";
    const ehPasta = chave.startsWith("p:");
    const caixa = item.getBoundingClientRect();
    const pega = { dx: e.clientX - caixa.left, dy: e.clientY - caixa.top, largura: caixa.width, altura: caixa.height };
    const ponteiro = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const rolo = rolagemDe(grade);
    let ativo = false;
    let ultimo = { x: x0, y: y0 };
    let destino: DestinoArrasto = { area: null, antesDe: null, depoisDe: null, dentro: null };
    let inicial = "";
    let velY = 0;
    let raf = 0;
    let espera = 0;
    let soltarCursor: (() => void) | null = null;
    const soltarSelecao = toque ? () => {} : segurar("");

    const calcular = () => {
      // A ÁREA: o painel da pasta aberta sob o ponteiro (só quadros entram nela), senão a raiz.
      let area: string | null = null;
      if (!ehPasta)
        for (const p of grade.querySelectorAll<HTMLElement>("[data-painel-pasta]")) {
          const r = p.getBoundingClientRect();
          if (r.height > 8 && ultimo.x >= r.left && ultimo.x <= r.right && ultimo.y >= r.top && ultimo.y <= r.bottom) area = p.dataset.painelPasta ?? null;
        }
      const el = area == null ? grade : grade.querySelector<HTMLElement>(`[data-grade-area="${CSS.escape(area)}"]`);
      if (!el) return;
      const itens = [...el.querySelectorAll<HTMLElement>(":scope > [data-grade-item]")].filter((i) => i.dataset.gradeItem !== chave);
      let novo: DestinoArrasto = { area, antesDe: null, depoisDe: null, dentro: null };
      // DENTRO de uma pasta: o quadro sobre o MEIO do card da pasta. A SOMBRA fica onde estava (a grade não se mexe —
      // senão a pasta fugiria de baixo do dedo).
      if (!ehPasta && area == null) {
        for (const i of itens) {
          const id = i.dataset.pastaId;
          if (!id) continue;
          const r = i.getBoundingClientRect();
          const mx = r.width * 0.2;
          const my = r.height * 0.15;
          if (ultimo.x > r.left + mx && ultimo.x < r.right - mx && ultimo.y > r.top + my && ultimo.y < r.bottom - my) novo = { ...destino, dentro: id };
        }
      }
      if (!novo.dentro) {
        // A POSIÇÃO: antes do 1º item que está depois do ponteiro na ordem de leitura; senão, depois do último.
        const antes = itens.find((i) => {
          const r = i.getBoundingClientRect();
          return ultimo.y < r.top || (ultimo.y <= r.bottom && ultimo.x < r.left + r.width / 2);
        });
        novo = antes ? { ...novo, antesDe: antes.dataset.gradeItem ?? null } : { ...novo, depoisDe: itens.at(-1)?.dataset.gradeItem ?? null };
      }
      if (chaveDestino(novo) === chaveDestino(destino) && inicial) return;
      destino = novo;
      if (!inicial) inicial = chaveDestino(novo);
      setArrasto({ chave, x: ultimo.x, y: ultimo.y, ...pega, destino });
    };
    const moverFantasma = () => {
      if (fantasma.current) fantasma.current.style.transform = `translate3d(${ultimo.x - pega.dx}px, ${ultimo.y - pega.dy}px, 0)`;
    };
    const rolar = () => {
      if (velY) {
        if (rolo) rolo.scrollTop += velY;
        else window.scrollBy(0, velY);
        calcular();
      }
      raf = requestAnimationFrame(rolar);
    };
    const ativar = () => {
      ativo = true;
      arrastou.current = true;
      soltarCursor = segurar("grabbing");
      if (toque) navigator.vibrate?.(12);
      calcular();
      raf = requestAnimationFrame(rolar);
    };
    // No TOQUE: segurar parado ativa; mexer antes disso é rolagem (o arrasto não começa).
    if (toque) espera = window.setTimeout(ativar, TOQUE_MS);
    const mover = (ev: PointerEvent) => {
      if (ev.pointerId !== ponteiro) return;
      ultimo = { x: ev.clientX, y: ev.clientY };
      if (!ativo) {
        const d = Math.hypot(ev.clientX - x0, ev.clientY - y0);
        if (toque) {
          if (d > 8) limpar();
          return;
        }
        if (d < LIMIAR) return;
        ativar();
      }
      if (ev.cancelable) ev.preventDefault();
      const r = rolo ? rolo.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      velY = ev.clientY < r.top + BORDA ? -VEL : ev.clientY > r.bottom - BORDA ? VEL : 0;
      moverFantasma();
      calcular();
    };
    // O toque ATIVO não pode rolar a tela (e o menu do "segurar" do navegador não abre).
    const travarToque = (ev: TouchEvent) => {
      if (ativo && ev.cancelable) ev.preventDefault();
    };
    const semMenu = (ev: Event) => ev.preventDefault();
    const limpar = () => {
      window.clearTimeout(espera);
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", fim);
      window.removeEventListener("pointercancel", fim);
      window.removeEventListener("touchmove", travarToque);
      window.removeEventListener("contextmenu", semMenu);
      soltarCursor?.();
      soltarSelecao();
      encerrar.current = null;
    };
    const fim = (ev: PointerEvent) => {
      if (ev.pointerId !== ponteiro) return;
      limpar();
      if (ativo) window.setTimeout(() => (arrastou.current = false), 0);
      if (!ativo || ev.type !== "pointerup") return setArrasto(null);
      const final = destino;
      // Soltou onde estava: nada muda.
      if (!final.dentro && chaveDestino(final) === inicial) return setArrasto(null);
      const aplicar = () => {
        setArrasto(null);
        onSoltar(chave, final);
      };
      const ms = duracaoMotionMs();
      const lugar = final.dentro
        ? grade.querySelector<HTMLElement>(`[data-pasta-id="${CSS.escape(final.dentro)}"]`)?.getBoundingClientRect()
        : grade.querySelector<HTMLElement>("[data-sombra-grade]")?.getBoundingClientRect();
      if (!lugar || ms <= 0) return aplicar();
      // POUSA: voa até a sombra — ou ENCOLHE até o meio da pasta.
      const x = final.dentro ? lugar.left + lugar.width / 2 - pega.largura / 2 + pega.dx : lugar.left + pega.dx;
      const y = final.dentro ? lugar.top + lugar.height / 2 - pega.altura / 2 + pega.dy : lugar.top + pega.dy;
      setArrasto({ chave, x, y, ...pega, destino: final, pousando: true, entrando: !!final.dentro });
      window.setTimeout(aplicar, ms);
    };
    encerrar.current = limpar;
    window.addEventListener("pointermove", mover, { passive: false });
    window.addEventListener("pointerup", fim);
    window.addEventListener("pointercancel", fim);
    window.addEventListener("touchmove", travarToque, { passive: false });
    window.addEventListener("contextmenu", semMenu);
  };

  /** O último gesto foi um ARRASTO (o clique que vem depois não abre nada). */
  const foiArrasto = () => {
    const f = arrastou.current;
    arrastou.current = false;
    return f;
  };
  return { arrasto, fantasma, iniciar, foiArrasto };
}

/** O LUGAR onde o card vai cair (a sombra, no tamanho da célula). */
function SombraGrade({ altura }: { altura: number }) {
  return <div data-sombra-grade aria-hidden className="rounded-card bg-accent/10 ring-1 ring-accent/30 ring-inset" style={{ minHeight: altura }} />;
}

/** A pasta ABERTA por último neste aparelho (conveniência — `localStorage`, com try/catch). */
const CHAVE_ABERTA = "tarefas:pasta-aberta";

/**
 * O PAINEL de uma pasta aberta: ocupa a linha inteira da grade logo abaixo da linha da pasta e ABRE/FECHA animando a
 * altura (`grid-template-rows` 0fr ↔ 1fr) — os cards de baixo deslizam junto; os de dentro entram em sequência.
 */
function PainelPasta({ pasta, aberto, onFechado, onFechar, children }: { pasta: ConjuntoQuadros; aberto: boolean; onFechado: () => void; onFechar: () => void; children: ReactNode }) {
  const [visivel, setVisivel] = useState(false);
  const fechado = useRef(onFechado);
  fechado.current = onFechado;
  useEffect(() => {
    // Monta FECHADO e abre no quadro seguinte (a transição roda); fechar sem movimento (reduzido) desmonta na hora.
    const r = requestAnimationFrame(() => setVisivel(aberto));
    if (!aberto && duracaoMotionMs() <= 0) fechado.current();
    return () => cancelAnimationFrame(r);
  }, [aberto]);
  return (
    <div
      data-painel-pasta={pasta.id}
      className="col-span-full grid transition-[grid-template-rows,opacity] duration-[var(--motion-duration)] ease-[var(--motion-ease)]"
      style={{ gridTemplateRows: visivel ? "1fr" : "0fr", opacity: visivel ? 1 : 0 }}
      onTransitionEnd={(e) => e.target === e.currentTarget && e.propertyName === "grid-template-rows" && !aberto && onFechado()}
    >
      <div className="min-h-0 overflow-hidden">
        <section
          aria-label={`Pasta ${pasta.nome}`}
          className="rounded-card border p-3"
          style={{ background: `color-mix(in srgb, ${pasta.cor} 10%, var(--surface-2))`, borderColor: `color-mix(in srgb, ${pasta.cor} 35%, var(--border))` }}
        >
          <div className="mb-2 flex items-center gap-2">
            <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white" style={{ background: pasta.cor }}>
              <IconPastaAberta className="h-3.5 w-3.5" />
            </span>
            <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-text">{pasta.nome}</h3>
            <button
              type="button"
              onClick={onFechar}
              aria-label={`Fechar a pasta ${pasta.nome}`}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-muted hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:h-8 lg:w-8"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>
          {children}
        </section>
      </div>
    </div>
  );
}

/**
 * A GRADE de quadros com PASTAS — a MESMA na tela de Tarefas e no "Mudar de quadros": as pastas e os quadros soltos na
 * ORDEM da pessoa (`itensDaGrade`). Tocar numa pasta a ABRE no lugar (o painel entra abaixo da linha dela, empurrando os
 * cards); ARRASTAR (`useArrastoGrade`) reordena, põe um quadro numa pasta (soltar sobre ela, ou dentro da aberta) e o tira
 * dela; Alt+←/→ reordenam pelo teclado. `onMover` ausente = só leitura. `extra` = o último item (o card "Novo quadro").
 */
export function GradePastas({
  quadros,
  estado,
  ocultarVazias = false,
  favoritos,
  onFavorito,
  atual,
  aba,
  onAbrir,
  extra,
  onMover,
  menuPasta,
}: {
  quadros: QuadroCardDados[];
  estado: PastasQuadros;
  /** Com filtro/busca: sem as pastas que ficaram vazias. */
  ocultarVazias?: boolean;
  favoritos: number[];
  onFavorito?: (id: number) => void;
  atual?: number;
  aba?: string;
  onAbrir?: () => void;
  extra?: ReactNode;
  /** `raiz` = as chaves da raiz como estão na tela (a base de `moverNaGrade`). */
  onMover?: (raiz: string[], chave: string, destino: DestinoGrade) => void;
  menuPasta?: (c: ConjuntoQuadros) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const itens = itensDaGrade(quadros, estado, ocultarVazias);
  const raizChaves = itens.map((i) => i.chave);
  const [aberta, setAberta] = useState<string | null>(null);
  const [fechando, setFechando] = useState<string | null>(null);
  const [recebeu, setRecebeu] = useState<string | null>(null);
  const [colunas, setColunas] = useState(1);
  useEffect(() => {
    try {
      setAberta(localStorage.getItem(CHAVE_ABERTA));
    } catch {
      // sem armazenamento: começa fechada
    }
  }, []);
  const abrir = (id: string | null) => {
    setAberta((a) => {
      if (a && a !== id) setFechando(a);
      return id;
    });
    try {
      if (id) localStorage.setItem(CHAVE_ABERTA, id);
      else localStorage.removeItem(CHAVE_ABERTA);
    } catch {
      // sem armazenamento
    }
  };
  const alternar = (id: string) => abrir(aberta === id ? null : id);
  // A ENTRADA em sequência dos cards vale só logo depois de ABRIR (mover o painel no DOM reiniciaria a animação).
  const [entrando, setEntrando] = useState<string | null>(null);
  useEffect(() => {
    if (!aberta) return;
    setEntrando(aberta);
    const t = window.setTimeout(() => setEntrando(null), duracaoMotionMs() + 700);
    return () => window.clearTimeout(t);
  }, [aberta]);
  // Quantas COLUNAS a grade tem agora (o painel da pasta entra no fim da linha dela).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setColunas(Math.max(1, getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { arrasto, fantasma, iniciar, foiArrasto } = useArrastoGrade({
    raiz: ref,
    onSoltar:
      onMover &&
      ((chave, d) => {
        if (d.dentro) {
          onMover(raizChaves, chave, { pasta: d.dentro });
          setRecebeu(d.dentro);
          window.setTimeout(() => setRecebeu(null), Math.max(duracaoMotionMs(), 1) + 50);
        } else onMover(raizChaves, chave, { pasta: d.area, antesDe: d.antesDe, depoisDe: d.depoisDe });
      }),
  });

  // Alt+←/→: troca de lugar com o vizinho da MESMA área.
  const teclado = (e: KeyboardEvent<HTMLElement>, chave: string, area: string | null, lista: string[]) => {
    if (!onMover || !e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    const i = lista.indexOf(chave);
    const j = e.key === "ArrowLeft" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= lista.length) return;
    e.preventDefault();
    onMover(raizChaves, chave, e.key === "ArrowLeft" ? { pasta: area, antesDe: lista[j] } : { pasta: area, depoisDe: lista[j] });
  };

  const cardQuadro = (q: QuadroCardDados) => (
    <QuadroCard
      quadro={q}
      href={`/painel/tarefas/${q.id}${aba ? `?aba=${aba}` : ""}`}
      atual={q.id === atual}
      favorito={favoritos.includes(q.id)}
      onFavorito={onFavorito && (() => onFavorito(q.id))}
      onAbrir={onAbrir}
    />
  );
  const cardPasta = (it: Extract<ItemGrade<QuadroCardDados>, { tipo: "pasta" }>) => (
    <PastaQuadro
      pasta={it.pasta}
      quadros={it.quadros}
      aberta={aberta === it.pasta.id}
      alvo={arrasto?.destino.dentro === it.pasta.id && !arrasto.pousando}
      recebeu={recebeu === it.pasta.id}
      onAlternar={() => alternar(it.pasta.id)}
      menu={menuPasta?.(it.pasta)}
    />
  );
  // Um item arrastável (o wrapper leva o gesto, o clique pós-arrasto é engolido e o toque longo não abre o menu do navegador).
  const envolver = (chave: string, area: string | null, lista: string[], conteudo: ReactNode, extraAttrs: { pastaId?: string; indice?: number } = {}) => (
    <div
      key={chave}
      data-grade-item={chave}
      data-pasta-id={extraAttrs.pastaId}
      className={`${arrasto?.chave === chave ? "hidden" : ""} ${onMover ? "touch-manipulation select-none [-webkit-touch-callout:none]" : ""} ${extraAttrs.indice != null ? "animate-fade-in-up" : ""}`}
      style={extraAttrs.indice != null ? { animationDelay: `${Math.min(extraAttrs.indice, 12) * 30}ms` } : undefined}
      onPointerDown={onMover ? (e) => iniciar(e, chave) : undefined}
      onClickCapture={(e) => {
        if (foiArrasto()) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onKeyDown={(e) => teclado(e, chave, area, lista)}
    >
      {conteudo}
    </div>
  );
  const sombra = (area: string | null) => (arrasto && arrasto.destino.area === area ? <SombraGrade key="__sombra" altura={arrasto.altura} /> : null);
  // Monta uma área com a SOMBRA no destino. O card arrastado sai do fluxo mas SEGUE no DOM (oculto, no fim da mesma área):
  // no toque, o dedo continua preso ao elemento em que começou — tirá-lo do documento soltaria o arrasto.
  const comSombra = (area: string | null, nos: { chave: string; no: ReactNode }[]) => {
    const vis = nos.filter((n) => n.chave !== arrasto?.chave);
    const oculto = nos.find((n) => n.chave === arrasto?.chave)?.no ?? null;
    const s = sombra(area);
    if (!s || !arrasto) return { nos: vis.map((n) => n.no), oculto };
    const d = arrasto.destino;
    const i = d.antesDe ? vis.findIndex((n) => n.chave === d.antesDe) : d.depoisDe ? vis.findIndex((n) => n.chave === d.depoisDe) + 1 : vis.length;
    const k = i < 0 ? vis.length : i;
    return { nos: [...vis.slice(0, k).map((n) => n.no), s, ...vis.slice(k).map((n) => n.no)], oculto };
  };

  const painel = (it: Extract<ItemGrade<QuadroCardDados>, { tipo: "pasta" }>, abertoAgora: boolean) => {
    const internas = it.quadros.map((q) => `q:${q.id}`);
    return (
      <PainelPasta
        key={`painel:${it.pasta.id}`}
        pasta={it.pasta}
        aberto={abertoAgora}
        onFechar={() => abrir(null)}
        onFechado={() => setFechando((f) => (f === it.pasta.id ? null : f))}
      >
        <div data-grade-area={it.pasta.id} className={GRADE}>
          {(() => {
            const a = comSombra(
              it.pasta.id,
              it.quadros.map((q, i) => ({ chave: `q:${q.id}`, no: envolver(`q:${q.id}`, it.pasta.id, internas, cardQuadro(q), entrando === it.pasta.id ? { indice: i } : {}) })),
            );
            return [...a.nos, a.oculto];
          })()}
          {!it.quadros.length && !sombra(it.pasta.id) && (
            <p className="col-span-full px-1 py-6 text-center text-[13px] text-muted">{onMover ? "Pasta vazia — arraste quadros para cá." : "Pasta vazia."}</p>
          )}
        </div>
      </PainelPasta>
    );
  };

  // A raiz: cada item + a sombra; o PAINEL da pasta aberta (e o da que está fechando) entra no fim da LINHA dela.
  const { nos: nosRaiz, oculto } = comSombra(
    null,
    itens.map((it) => ({
      chave: it.chave,
      no: envolver(it.chave, null, raizChaves, it.tipo === "pasta" ? cardPasta(it) : cardQuadro(it.quadro), it.tipo === "pasta" ? { pastaId: it.pasta.id } : {}),
    })),
  );
  const total = nosRaiz.length + (extra ? 1 : 0);
  const inserir: { pos: number; no: ReactNode }[] = [];
  for (const id of [fechando, aberta]) {
    if (!id) continue;
    const it = itens.find((x): x is Extract<ItemGrade<QuadroCardDados>, { tipo: "pasta" }> => x.tipo === "pasta" && x.pasta.id === id);
    if (!it) continue;
    const idx = nosRaiz.findIndex((n) => (n as { key?: string } | null)?.key === it.chave);
    if (idx < 0) continue;
    inserir.push({ pos: Math.min(total, Math.ceil((idx + 1) / colunas) * colunas), no: painel(it, id === aberta) });
  }
  const nos: ReactNode[] = [...nosRaiz, ...(extra ? [<div key="__extra">{extra}</div>] : [])];
  for (const p of inserir.sort((a, b) => b.pos - a.pos)) nos.splice(p.pos, 0, p.no);
  nos.push(oculto);

  const presa = arrasto ? itens.find((i) => i.chave === arrasto.chave) ?? itens.flatMap((i) => (i.tipo === "pasta" ? i.quadros.map((q) => ({ tipo: "quadro" as const, chave: `q:${q.id}`, quadro: q })) : [])).find((i) => i.chave === arrasto.chave) : null;

  return (
    <>
      <div ref={ref} data-grade-area="" className={GRADE}>
        {nos}
      </div>
      {arrasto && presa && (
        <CartaoPreso arrasto={arrasto} fantasma={fantasma}>
          {presa.tipo === "pasta" ? cardPasta(presa) : cardQuadro(presa.quadro)}
        </CartaoPreso>
      )}
    </>
  );
}
