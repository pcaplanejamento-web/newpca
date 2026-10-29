"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ATRIBUTO_MENU, aplicarMenuGuardado, CHAVE_MENU, EVENTO_ALTERNAR_MENU } from "@/lib/menu-lateral";
import { IconeNavegacao } from "./CarregandoLink";
import { IconClose, IconMenu, IconRecolherMenu } from "./icons";

/**
 * O MENU LATERAL do sistema — UM componente para o painel (`AppShell`) e a tela pública: a VAGA (sticky, altura do display)
 * anima a largura e empurra o conteúdo; o menu dentro dela é absoluto: recolhido vira o trilho de ícones e, ao passar o
 * mouse, abre POR CIMA do conteúdo. Regras em globals.css (.menu-vaga/.menu-lateral/.menu-esconde). No celular, a
 * `GavetaMenu` (hambúrguer) com o mesmo conteúdo.
 */

export type ItemMenu = { href: string; label: string; Icon: LucideIcon };
export type SecaoMenu = { chave: string; titulo?: string; itens: readonly ItemMenu[] };

/** Durante a animação do menu, as grades de cartões (auto-fill) mudam de colunas no meio do caminho: o cartão que
 *  SALTA de lugar (nova coluna/linha) desliza da posição antiga até a nova (FLIP), em vez de pular. Só nesses 340 ms. */
/** Movimento desligado (sistema ou o ADM em Aparência). */
function movimentoReduzido(): boolean {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  const m = document.documentElement.dataset.motion;
  return m === "off" || m === "reduced";
}

function deslizarGrades() {
  if (movimentoReduzido()) return;
  const itens = Array.from(document.querySelectorAll<HTMLElement>('main [class*="auto-fill"] > *'));
  if (!itens.length) return;
  // A posição DENTRO da grade (não na página): a coluna inteira anda com o menu — isso não é salto.
  const naGrade = (e: HTMLElement) => {
    const g = e.parentElement as HTMLElement;
    const base = e.offsetParent === g ? { x: 0, y: 0 } : { x: g.offsetLeft, y: g.offsetTop };
    return { x: e.offsetLeft - base.x, y: e.offsetTop - base.y, w: e.offsetWidth };
  };
  const antes = new Map(itens.map((e) => [e, { grade: naGrade(e), visual: e.getBoundingClientRect() }]));
  const fim = performance.now() + 340;
  const passo = () => {
    for (const e of itens) {
      const a = antes.get(e);
      if (!a) continue;
      const g = naGrade(e);
      // SALTO = trocou de coluna/linha ou a largura mudou de uma vez (a grade ganhou/perdeu uma coluna). O que só
      // estica/encolhe com o menu acompanha sozinho.
      const salto = Math.abs(g.x - a.grade.x) > 40 || Math.abs(g.y - a.grade.y) > 40 || Math.abs(g.w - a.grade.w) > a.grade.w * 0.12;
      if (salto) {
        for (const an of e.getAnimations()) an.cancel();
        const novo = e.getBoundingClientRect();
        const v = a.visual;
        e.style.transformOrigin = "0 0";
        e.animate(
          [
            { transform: `translate(${v.left - novo.left}px, ${v.top - novo.top}px) scale(${v.width / novo.width || 1}, ${v.height / novo.height || 1})` },
            { transform: "none" },
          ],
          { duration: Math.max(120, fim - performance.now()), easing: "cubic-bezier(.32,.72,0,1)" },
        ).onfinish = () => {
          e.style.transformOrigin = "";
        };
      }
      antes.set(e, { grade: g, visual: e.getBoundingClientRect() });
    }
    if (performance.now() < fim) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

/** Os ITENS do menu por seção (o título vira a linha curta no trilho recolhido). `ativo` decide o item marcado. */
export function ItensMenu({ secoes, ativo, onNavigate }: { secoes: readonly SecaoMenu[]; ativo: (item: ItemMenu) => boolean; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      {secoes.map((secao) => (
        <div key={secao.chave}>
          {/* Recolhido, o título vira uma linha curta centrada no trilho (o separador do módulo). */}
          {secao.titulo && (
            <div className="relative mb-1.5">
              <p className="menu-esconde truncate px-2 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-faint">{secao.titulo}</p>
              <span aria-hidden="true" className="menu-linha pointer-events-none absolute left-[10px] top-0 h-px w-6 bg-border-2" />
            </div>
          )}
          <nav className="flex flex-col gap-0.5">
            {secao.itens.map((item) => {
              const active = ativo(item);
              const { Icon } = item;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  unstable_dynamicOnHover
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-[11px] whitespace-nowrap rounded-chip border px-[12px] py-2 text-[13.5px] transition-colors duration-[var(--motion-duration)] ${
                    active
                      ? "border-border-2 bg-sb-active font-semibold text-text"
                      : "border-transparent font-medium text-text-2 hover:bg-surface-2 hover:text-text"
                  }`}
                >
                  <IconeNavegacao Icon={Icon} className={`h-[17px] w-[17px] shrink-0 ${active ? "text-accent" : ""}`} strokeWidth={1.8} />
                  <span className="menu-esconde min-w-0 truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </div>
  );
}

/** O menu lateral do DESKTOP: marca (topo), conteúdo que rola, rodapé e o botão Recolher (com o `extraRodape` ao lado). */
export function MenuLateral({
  topo,
  conteudo,
  rodape,
  extraRodape,
  semMarca,
  guardar = true,
  inicial,
}: {
  topo: ReactNode;
  /** false = recolher/expandir vale só nesta tela (a tela pública: o início é do ADM e a preferência do painel fica). */
  guardar?: boolean;
  /** Com `guardar={false}`: o menu começa recolhido (true) ou aberto (false) a CADA chegada à tela — também por navegação do cliente. */
  inicial?: boolean;
  /** Logo abaixo da marca (ex.: a pesquisa). */
  semMarca?: ReactNode;
  conteudo: ReactNode;
  rodape?: ReactNode;
  extraRodape?: ReactNode;
}) {
  // Menu lateral recolhido (o atributo do <html> já veio do script antes da pintura; aqui só o espelho para a tela).
  const [recolhido, setRecolhido] = useState(false);
  // Logo depois de recolher, o ponteiro ainda está em cima: não reabre por cima até sair e voltar.
  const [semPeek, setSemPeek] = useState(false);
  useLayoutEffect(() => {
    if (!guardar && inicial !== undefined) document.documentElement.toggleAttribute(ATRIBUTO_MENU, inicial);
    setRecolhido(document.documentElement.hasAttribute(ATRIBUTO_MENU));
    // Sem guardar: ao sair da tela, o atributo volta à preferência do aparelho.
    return guardar ? undefined : aplicarMenuGuardado;
  }, [guardar, inicial]);
  function alternarMenu() {
    const novo = !document.documentElement.hasAttribute(ATRIBUTO_MENU);
    // O CONTEÚDO muda de largura UMA vez (a vaga não anima) e desliza por transform até o lugar novo — nada reflui a cada
    // quadro (as tabelas não tremem, os KPIs não mudam de altura).
    const conteudo = document.querySelector<HTMLElement>("[data-coluna-conteudo]");
    const antes = conteudo?.getBoundingClientRect().left ?? 0;
    document.documentElement.toggleAttribute(ATRIBUTO_MENU, novo);
    if (conteudo && !movimentoReduzido()) {
      const dx = antes - conteudo.getBoundingClientRect().left;
      if (dx) {
        for (const an of conteudo.getAnimations()) an.cancel();
        conteudo.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], { duration: 300, easing: "cubic-bezier(.32,.72,0,1)" });
      }
    }
    deslizarGrades();
    if (guardar)
      try {
        localStorage.setItem(CHAVE_MENU, novo ? "1" : "0");
      } catch {
        /* sem armazenamento: vale nesta visita */
      }
    setRecolhido(novo);
    setSemPeek(novo);
  }
  // A ação "Recolher ou expandir o menu" da pesquisa do sistema.
  const alternarRef = useRef(alternarMenu);
  alternarRef.current = alternarMenu;
  useEffect(() => {
    const f = () => alternarRef.current();
    window.addEventListener(EVENTO_ALTERNAR_MENU, f);
    return () => window.removeEventListener(EVENTO_ALTERNAR_MENU, f);
  }, []);

  return (
    <div className="menu-vaga relative z-40 hidden shrink-0 lg:sticky lg:top-0 lg:block lg:h-dvh print:!hidden">
      <aside
        data-sem-peek={semPeek ? "" : undefined}
        onPointerLeave={() => setSemPeek(false)}
        className="menu-lateral absolute inset-y-0 left-0 flex flex-col overflow-hidden border-r border-border bg-surface"
      >
        <div className="flex h-full w-full min-w-0 flex-col">
          {/* Faixa da marca na ALTURA do cabeçalho (a borda de baixo continua a dele) */}
          <div className="flex h-[var(--h-header)] shrink-0 items-center border-b border-border px-3">{topo}</div>
          {/* Alinhada ao conteúdo: em cima o respiro do conteúdo (--pad-canvas-y) e embaixo o vão entre componentes. */}
          {semMarca ? <div className="shrink-0 px-2 pt-[var(--pad-canvas-y)] pb-[var(--gap-block)]">{semMarca}</div> : null}
          <div className={`menu-rolagem flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4 ${semMarca ? "pt-0" : "pt-[var(--pad-canvas-y)]"}`}>{conteudo}</div>
          <div className="p-2 pt-0">
            {rodape}
            <div className="mt-0.5 flex items-center">
              <button
                type="button"
                onClick={alternarMenu}
                aria-pressed={recolhido}
                aria-label={recolhido ? "Expandir o menu" : "Recolher o menu"}
                title={recolhido ? "Expandir o menu" : "Recolher o menu"}
                className="grid h-8 w-11 shrink-0 place-items-center rounded-control text-faint transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <IconRecolherMenu className="menu-alternar h-[18px] w-[18px]" strokeWidth={1.8} />
              </button>
              <div className="menu-esconde min-w-0 flex-1">{extraRodape}</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

/** A GAVETA do celular (hambúrguer): o mesmo conteúdo do menu, Esc e o fundo escurecido fecham. */
export function GavetaMenu({
  aberto,
  onFechar,
  topo,
  acima,
  conteudo,
  rodape,
}: {
  aberto: boolean;
  onFechar: () => void;
  topo: ReactNode;
  /** Entre a marca e a navegação (ex.: os seletores do cabeçalho no celular). */
  acima?: ReactNode;
  conteudo: ReactNode;
  rodape?: ReactNode;
}) {
  // Esc fecha a gaveta (o caminho do teclado; o fundo escurecido é só do ponteiro) — menos com um diálogo por cima.
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[role='dialog']")) onFechar();
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [aberto, onFechar]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div aria-hidden="true" className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm" onClick={onFechar} />
      <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[82%] animate-fade-in-up flex-col bg-surface shadow-soft">
        <div className="flex h-[var(--h-header)] shrink-0 items-center justify-between border-b border-border pl-4 pr-1">
          {topo}
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={onFechar}
            className="inline-flex h-11 w-11 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-2"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>
        {acima}
        <div className="flex-1 overflow-y-auto px-2 py-4">{conteudo}</div>
        {rodape ? <div className="p-2 pt-0 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))]">{rodape}</div> : null}
      </aside>
    </div>
  );
}

/** O CABEÇALHO do sistema — o MESMO no painel e na tela pública: a altura de `--h-header` com a borda nela (a faixa da marca
 *  do `MenuLateral` tem a mesma altura — as duas bordas formam UMA linha), o hambúrguer no celular, o `inicio` (marca/trilha)
 *  e os controles à direita. */
export function CabecalhoApp({ onMenu, inicio, direita }: { onMenu: () => void; inicio?: ReactNode; direita: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-[var(--h-header)] items-center gap-2 border-b border-border bg-surface px-[var(--pad-canvas)] print:hidden">
      <button
        type="button"
        aria-label="Abrir menu"
        onClick={onMenu}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-text-2 transition-colors hover:bg-surface-2 lg:hidden"
      >
        <IconMenu className="h-5 w-5" />
      </button>
      {inicio}
      <div className="ml-auto flex min-w-0 items-center gap-1.5">{direita}</div>
    </header>
  );
}
