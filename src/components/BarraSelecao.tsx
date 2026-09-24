"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { textoPlanejamentos } from "@/lib/dfd-tratamento";
import { brl, num } from "@/lib/format";
import { BotaoCopiar } from "./BotaoCopiar";
import { Button } from "./Button";
import { tokenPx } from "./espacamento";
import { IconChevronDown, IconClose } from "./icons";

/** Um registro selecionado (vira um chip removível). */
export type RegistroSelecao = { key: string | number; rotulo: string };

/** Chips renderizados (acima disso, um "+N" — a seleção em si segue completa). */
const MAX_CHIPS = 80;
/** Respiro inferior do `<main>` além da navegação (o token `--pad-canvas` — a margem do conteúdo): a barra FIXA
 * cobre esse respiro, então só o EXCEDENTE da altura dela ocupa lugar no fluxo. */
const respiroMain = () => tokenPx("--pad-canvas", 16);

/**
 * Barra de SELEÇÃO — a MESMA em toda tabela com seleção (DFDs, Protocolos e Itens da Mesa; DFDs dos
 * banners de protocolo). Em cima, o **registro das seleções** (chips removíveis — tirar um chip tira a
 * linha da seleção; "Limpar seleção" zera); no meio, a contagem + **somatório (R$)** dos selecionados;
 * embaixo, o editor de massa (`children`). Com `fixa`, fica FIXA no rodapé do display (acima da
 * navegação inferior no celular) — mesmo com a tabela curta —, alinhada à coluna de conteúdo (medida pelo
 * LUGAR que reserva no fluxo), e informa esse lugar (`onAltura`) para a tabela reservar o espaço; no
 * celular pode ser recolhida (fica só o resumo). Só tokens/componentes do design-system.
 */
export function BarraSelecao({
  registros,
  onRemover,
  onLimpar,
  resumo,
  fixa = false,
  onAltura,
  bloqueada = false,
  acoes,
  children,
}: {
  registros: RegistroSelecao[];
  onRemover: (key: string | number) => void;
  onLimpar: () => void;
  /** Contagem + somatório (R$) dos selecionados. */
  resumo: ReactNode;
  /** Ações sobre a seleção na linha do resumo (ex.: "Copiar planejamentos"). */
  acoes?: ReactNode;
  /** Fixa no rodapé do display — a Mesa. Sem ela, fica no fluxo (rodapé de um banner). */
  fixa?: boolean;
  /** Lugar (px) que a barra fixa ocupa no FLUXO — a tabela desconta do espaço disponível (nada fica por baixo). */
  onAltura?: (px: number) => void;
  /** Aplicando uma edição: chips/limpar travados. */
  bloqueada?: boolean;
  /** Editor da seleção (ex.: `BarraEdicaoMassa`). */
  children?: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const lugarRef = useRef<HTMLDivElement>(null);
  const [recolhida, setRecolhida] = useState(false);
  // Fixa: lugar reservado no fluxo (px) e a faixa horizontal da coluna de conteúdo (viewport).
  const [lugar, setLugar] = useState(0);
  const [faixa, setFaixa] = useState<{ left: number; width: number } | null>(null);

  // Fixa: alinha a barra (position: fixed) à coluna de conteúdo — o LUGAR no fluxo tem a largura dela;
  // acompanha resize/sidebar. Antes da pintura (sem salto).
  useLayoutEffect(() => {
    const el = lugarRef.current;
    if (!fixa || !el) return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      setFaixa((f) => (f && f.left === r.left && f.width === r.width ? f : { left: r.left, width: r.width }));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    window.addEventListener("resize", medir);
    // O morph das abas (escala) muda a faixa medida sem redimensionar nada — remede ao fim das animações.
    document.addEventListener("animationend", medir);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", medir);
      document.removeEventListener("animationend", medir);
    };
  }, [fixa]);

  // Fixa: o lugar no fluxo = altura da barra − o respiro do main (que ela cobre) — ao montar (antes da
  // pintura), ao mudar (chips/recolher/editor) e zera ao desmontar. A tabela (`onAltura`) desconta o mesmo valor.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!fixa || !el) return;
    const raiz = document.documentElement.style;
    const medir = () => {
      const alt = Math.ceil(el.getBoundingClientRect().height);
      const px = Math.max(0, alt - respiroMain());
      setLugar(px);
      onAltura?.(px);
      // Os avisos flutuantes (canto inferior) sobem acima da barra enquanto ela existe.
      raiz.setProperty("--reserva-rodape", `${alt}px`);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => {
      ro.disconnect();
      onAltura?.(0);
      raiz.removeProperty("--reserva-rodape");
    };
  }, [fixa, onAltura]);

  const extras = registros.length - MAX_CHIPS;
  const barra = (
    <section
      ref={ref}
      aria-label="Seleção"
      className={
        fixa
          ? // Acima da navegação inferior no celular (≈4rem + área segura); no desktop, rente ao rodapé com a MESMA
            // margem do conteúdo (--pad-canvas) até a borda do display.
            "fixed bottom-[calc(4rem_+_env(safe-area-inset-bottom))] z-30 animate-fade-in-up pb-2 lg:bottom-0 lg:pb-[var(--pad-canvas)]"
          : "mb-3"
      }
      style={fixa ? (faixa ? { left: faixa.left, width: faixa.width } : { visibility: "hidden" }) : undefined}
    >
      <div className={`rounded-card border border-border bg-surface p-3 ${fixa ? "shadow-soft" : ""}`}>
        {/* Registro das seleções — chips removíveis (rola na horizontal, nunca estoura a tela). */}
        <div className="flex items-center gap-2">
          <ul className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1" aria-label="Itens selecionados">
            {registros.slice(0, MAX_CHIPS).map((r) => (
              <li
                key={r.key}
                className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-chip border border-accent/30 bg-accent-soft pl-2.5 pr-0.5 text-[12px] font-medium text-accent"
              >
                <span className="max-w-[16rem] truncate">{r.rotulo}</span>
                <button
                  type="button"
                  aria-label={`Tirar ${r.rotulo} da seleção`}
                  disabled={bloqueada}
                  onClick={() => onRemover(r.key)}
                  // Alvo de toque de 44px (a área clicável passa do círculo visível).
                  className="relative grid h-7 w-7 place-items-center rounded-full hover:bg-accent/15 disabled:opacity-50 after:absolute after:-inset-2 after:content-['']"
                >
                  <IconClose className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {extras > 0 && <li className="shrink-0 px-1 text-[12px] font-semibold text-muted">+{extras}</li>}
          </ul>
          <Button variant="ghost" onClick={onLimpar} disabled={bloqueada} className="shrink-0">
            Limpar seleção
          </Button>
          {fixa && children && (
            <Button
              variant="icon"
              aria-label={recolhida ? "Mostrar a edição" : "Recolher a edição"}
              aria-expanded={!recolhida}
              onClick={() => setRecolhida((v) => !v)}
              className="lg:hidden"
            >
              <IconChevronDown className={`h-4 w-4 transition-transform duration-[var(--motion-duration)] ${recolhida ? "rotate-180" : ""}`} />
            </Button>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="min-w-0 text-[12.5px] text-muted">{resumo}</div>
          {acoes}
        </div>
        {children && <div className={`mt-2 border-t border-border pt-2 ${recolhida ? "hidden lg:block" : ""}`}>{children}</div>}
      </div>
    </section>
  );
  if (!fixa) return barra;
  return (
    <>
      {/* Lugar no fluxo (o fim da página rola até acima da barra — a área segura do celular já está no respiro
          inferior do <main>). */}
      <div ref={lugarRef} aria-hidden style={{ height: lugar }} />
      {/* Portal no body: `position: fixed` dentro de um ancestral com transform/filter (o morph das abas do
          espaço do PCA) seria relativo a ELE — a barra saía deslocada e estourava a tela. */}
      {typeof document === "undefined" ? barra : createPortal(barra, document.body)}
    </>
  );
}

/** Um DFD selecionado (as três planilhas de DFDs mapeiam para isto). */
export type DfdSelecionado = { key: string | number; numero: string; planejamento: string | null; valor: number | null; itens: number | null };

/**
 * Barra de seleção da PLANILHA DE DFDs — a MESMA na Mesa, no protocolo gravado e na análise: chips "DFD
 * nº", contagem + Σ R$ + itens e o botão "Copiar planejamentos" ("1525:1549:1554" — separados por ":"
 * sem espaço). O editor de massa de cada tela vem em `children`.
 */
export function BarraSelecaoDfds({
  dfds,
  ...props
}: { dfds: DfdSelecionado[] } & Omit<Parameters<typeof BarraSelecao>[0], "registros" | "resumo" | "acoes">) {
  const planejamentos = textoPlanejamentos(dfds.map((d) => d.planejamento));
  return (
    <BarraSelecao
      {...props}
      registros={dfds.map((d) => ({ key: d.key, rotulo: `DFD ${d.numero}` }))}
      resumo={
        <ResumoSelecao
          qtd={dfds.length}
          singular="DFD"
          plural="DFDs"
          soma={dfds.reduce((t, d) => t + (d.valor ?? 0), 0)}
          extra={`${num(dfds.reduce((t, d) => t + (d.itens ?? 0), 0))} itens`}
        />
      }
      acoes={
        <BotaoCopiar
          texto={planejamentos}
          rotulo="Copiar planejamentos"
          titulo={planejamentos ? `Copia: ${planejamentos}` : "Os DFDs selecionados não têm nº de planejamento"}
        />
      }
    />
  );
}

/** Resumo padrão da seleção: contagem + SOMATÓRIO (R$) dos selecionados em destaque (+ um extra opcional). */
export function ResumoSelecao({ qtd, singular, plural, soma, extra }: { qtd: number; singular: string; plural: string; soma: number; extra?: string }) {
  return (
    <span>
      {num(qtd)} {qtd === 1 ? singular : plural} selecionado{qtd === 1 ? "" : "s"} · Σ{" "}
      <strong className="font-semibold tabular-nums text-text">{brl(soma)}</strong>
      {extra ? ` · ${extra}` : ""}
    </span>
  );
}
