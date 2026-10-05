"use client";

import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useAlturaTela } from "./AlturaCheia";

/**
 * ABAS do design system. `horizontal` = a faixa de abas com o sublinhado que desliza (rola de lado quando não cabe, a
 * ativa sempre à vista); `lateral` = no desktop, a lista de abas à esquerda com o fundo que desliza até a ativa (muitas
 * abas — ex.: Configurações); no celular vira a faixa horizontal.
 *
 * - Só a aba ABERTA é montada (as já visitadas ficam montadas e escondidas — guardam o rascunho e não recarregam);
 * - a ALTURA segue o conteúdo da aba aberta; com `alturaTela`, no desktop ocupa no máximo até o fim do display (a página
 *   não rola — o painel rola por dentro);
 * - o painel ENTRA pelo lado da troca (respeita "reduzir movimento");
 * - teclado: ←/→ (↑/↓ na lateral), Home/End — o foco vai junto; arrastar o dedo troca de aba (não dentro de tabelas,
 *   campos ou faixas que rolam de lado);
 * - `url` = o nome do parâmetro da URL que guarda a aba (recarregar volta nela).
 */
export type Tab = { key: string; label: string; icon?: ReactNode; content: ReactNode; /** A dica ao passar o mouse. */ dica?: string };

export function Tabs({
  tabs,
  className = "",
  inicial,
  layout = "horizontal",
  alturaTela = false,
  url,
}: {
  tabs: Tab[];
  className?: string;
  /** Aba aberta de início (key). */
  inicial?: string;
  layout?: "horizontal" | "lateral";
  /** No desktop, no máximo até o fim do display (a página não rola; o painel rola por dentro). */
  alturaTela?: boolean;
  /** O parâmetro da URL que guarda a aba aberta (ex.: "aba"). */
  url?: string;
}) {
  const base = useId();
  const [idx, setIdx] = useState(() => Math.max(0, inicial ? tabs.findIndex((t) => t.key === inicial) : 0));
  const [visitadas, setVisitadas] = useState<Set<string>>(() => new Set([tabs[Math.max(0, inicial ? tabs.findIndex((t) => t.key === inicial) : 0)]?.key ?? ""]));
  const [dir, setDir] = useState<1 | -1>(1);
  const [ind, setInd] = useState({ a: 0, b: 0, vertical: false });
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lista = useRef<HTMLDivElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const toque = useRef<{ x: number; y: number } | null>(null);
  const lateral = layout === "lateral";
  // O respiro de baixo dos contornos em volta (o cartão) também conta — senão a página rola esses pixels.
  const [reserva, setReserva] = useState(0);
  useLayoutEffect(() => {
    let soma = 0;
    for (let el = caixa.current?.parentElement; el && el.tagName !== "MAIN"; el = el.parentElement) {
      const cs = getComputedStyle(el);
      soma += (Number.parseFloat(cs.paddingBottom) || 0) + (Number.parseFloat(cs.borderBottomWidth) || 0);
    }
    setReserva(Math.ceil(soma));
  }, []);
  const altura = useAlturaTela(caixa, 320, reserva);

  // O indicador (sublinhado na horizontal; o fundo na lateral) mede a aba ativa — também ao mudar o tamanho.
  const medir = useCallback(() => {
    const el = btnRefs.current[idx];
    if (!el) return;
    const vertical = lateral && window.matchMedia("(min-width: 64rem)").matches;
    setInd(vertical ? { a: el.offsetTop, b: el.offsetHeight, vertical } : { a: el.offsetLeft, b: el.offsetWidth, vertical });
  }, [idx, lateral]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tabs.length` muda a posição das abas.
  useLayoutEffect(() => {
    medir();
    btnRefs.current[idx]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [idx, tabs.length, medir]);
  useEffect(() => {
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [medir]);

  const ir = (i: number, focar = false) => {
    const novo = Math.max(0, Math.min(tabs.length - 1, i));
    if (novo === idx) return;
    setDir(novo > idx ? 1 : -1);
    setIdx(novo);
    const chave = tabs[novo].key;
    setVisitadas((v) => (v.has(chave) ? v : new Set([...v, chave])));
    if (focar) btnRefs.current[novo]?.focus();
    if (url) {
      const u = new URL(window.location.href);
      u.searchParams.set(url, chave);
      window.history.replaceState(window.history.state, "", u);
    }
  };

  const teclado = (e: KeyboardEvent<HTMLDivElement>) => {
    const ant = lateral ? ["ArrowUp", "ArrowLeft"] : ["ArrowLeft"];
    const prox = lateral ? ["ArrowDown", "ArrowRight"] : ["ArrowRight"];
    if (ant.includes(e.key)) ir(idx - 1, true);
    else if (prox.includes(e.key)) ir(idx + 1, true);
    else if (e.key === "Home") ir(0, true);
    else if (e.key === "End") ir(tabs.length - 1, true);
    else return;
    e.preventDefault();
  };

  /** O dedo NÃO troca de aba quando começa num campo, numa tabela ou em algo que rola de lado. */
  const podeArrastar = (alvo: EventTarget | null) => {
    let el = alvo as HTMLElement | null;
    while (el && el !== caixa.current) {
      if (/^(INPUT|TEXTAREA|SELECT|TABLE)$/.test(el.tagName) || el.isContentEditable) return false;
      if (el.scrollWidth > el.clientWidth + 2 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) return false;
      el = el.parentElement;
    }
    return true;
  };

  const ativa = tabs[idx];
  return (
    <div
      ref={caixa}
      className={`flex min-h-0 flex-col ${lateral ? "lg:flex-row lg:gap-[var(--gap-block)]" : ""} ${className}`}
      style={alturaTela && altura ? ({ "--h-abas": `${altura}px` } as React.CSSProperties) : undefined}
    >
      <div
        ref={lista}
        role="tablist"
        aria-orientation={lateral ? "vertical" : "horizontal"}
        onKeyDown={teclado}
        className={`relative flex shrink-0 gap-1 overflow-x-auto border-b border-border [mask-image:linear-gradient(to_right,transparent,#000_12px,#000_calc(100%-12px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          lateral ? "lg:w-56 lg:flex-col lg:gap-0.5 lg:overflow-x-visible lg:overflow-y-auto lg:border-r lg:border-b-0 lg:pr-2 lg:[mask-image:none]" : ""
        } ${alturaTela && lateral ? "lg:max-h-[var(--h-abas)]" : ""}`}
      >
        {tabs.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            id={`${base}-t-${t.key}`}
            type="button"
            role="tab"
            aria-selected={i === idx}
            aria-controls={`${base}-p-${t.key}`}
            tabIndex={i === idx ? 0 : -1}
            title={t.dica ?? t.label}
            onClick={() => ir(i)}
            className={`relative z-10 inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-control px-3 text-[14px] font-medium transition-colors duration-[var(--motion-duration)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:min-h-[var(--h-control-sm)] ${
              lateral ? "lg:w-full lg:justify-start lg:text-[13.5px]" : ""
            } ${i === idx ? "text-accent" : "text-muted hover:bg-surface-2 hover:text-text-2"}`}
          >
            {t.icon && <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{t.icon}</span>}
            {t.label}
          </button>
        ))}
        {/* O indicador: o sublinhado (horizontal) ou o fundo que desliza (lateral, no desktop). */}
        <span
          aria-hidden
          className={`pointer-events-none absolute transition-[left,width,top,height] duration-[var(--motion-duration)] ease-[var(--motion-ease)] ${
            ind.vertical ? "left-0 z-0 w-[calc(100%-0.5rem)] rounded-control bg-accent-soft" : "bottom-0 h-[2px] rounded-full bg-accent"
          }`}
          style={ind.vertical ? { top: ind.a, height: ind.b } : { left: ind.a, width: ind.b }}
        />
      </div>

      <div
        className={`relative min-h-0 min-w-0 flex-1 ${alturaTela ? "lg:max-h-[var(--h-abas)] lg:overflow-y-auto lg:overscroll-contain" : ""} ${lateral ? "lg:pr-1" : ""}`}
        onTouchStart={(e) => {
          toque.current = podeArrastar(e.target) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
        }}
        onTouchEnd={(e) => {
          const t0 = toque.current;
          toque.current = null;
          if (!t0) return;
          const dx = e.changedTouches[0].clientX - t0.x;
          const dy = e.changedTouches[0].clientY - t0.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) ir(idx + (dx < 0 ? 1 : -1));
        }}
      >
        {tabs.map((t) =>
          visitadas.has(t.key) || t.key === ativa.key ? (
            <div
              key={t.key}
              id={`${base}-p-${t.key}`}
              role="tabpanel"
              aria-labelledby={`${base}-t-${t.key}`}
              hidden={t.key !== ativa.key}
              className={`pt-4 ${lateral ? "lg:pt-0" : ""} ${t.key === ativa.key ? (dir > 0 ? "animate-aba-direita" : "animate-aba-esquerda") : ""}`}
            >
              {t.content}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
