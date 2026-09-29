"use client";

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Popover genérico (base de FilterChip/MultiSelect/DateFilter/ColorField/Período/SeletorPessoa).
// O painel é renderizado em PORTAL (position: fixed no body) para NUNCA ser
// recortado por containers com overflow (ex.: cabeçalho de tabela) e é mantido
// dentro da tela. Fecha no clique-fora e no Esc; sombra suave. `className` = o
// invólucro (ex.: largura toda num formulário); `id`/`title` = os do gatilho
// (`<label htmlFor>`; a dica de um gatilho só-ícone). `papel` = o do painel ("menu",
// o padrão, ou "dialog" — busca/grade: escolher pessoa ou data); `bloqueado` = o
// gatilho não abre (ex.: gravando) sem perder o foco. O conteúdo em função recebe
// `fechar` e se o painel foi aberto pelo TECLADO (Enter/Espaço no gatilho). Fechar pelo `fechar` ou pelo Esc com o foco
// DENTRO do painel devolve o foco ao gatilho (o botão focado some junto com o painel — o foco cairia no `body`).
export function Dropdown({
  trigger,
  children,
  align = "start",
  className = "inline-block max-w-full",
  triggerClassName = "",
  panelClassName = "",
  width,
  ariaLabel,
  id,
  title,
  papel = "menu",
  bloqueado = false,
}: {
  trigger: ReactNode;
  children: ReactNode | ((close: () => void, abertura: { teclado: boolean }) => ReactNode);
  align?: "start" | "end";
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
  width?: number;
  ariaLabel?: string;
  id?: string;
  title?: string;
  papel?: "menu" | "dialog";
  bloqueado?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Aberto pelo teclado (o clique de Enter/Espaço tem `detail` 0): quem usa leva o foco para dentro do painel.
  const [teclado, setTeclado] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, w: 224, maxH: 520 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Posiciona o painel (fixed) e decide abrir para BAIXO ou para CIMA conforme o
  // espaço disponível; sempre limita a altura à viewport (rola por dentro). Assim
  // o filtro NUNCA é cortado, mesmo quando o gatilho está no rodapé da tela.
  const reposicionar = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 6;
    const w = Math.min(width ?? Math.max(224, r.width), vw - 16);
    let left = align === "end" ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, vw - w - 8));
    const espacoAbaixo = vh - r.bottom - 8;
    const espacoAcima = r.top - 8;
    const desejada = panelRef.current?.scrollHeight ?? 0;
    const abrirAcima = espacoAbaixo < Math.min(desejada || 320, 360) && espacoAcima > espacoAbaixo;
    let top: number;
    let maxH: number;
    if (abrirAcima) {
      maxH = espacoAcima;
      top = Math.max(8, r.top - gap - Math.min(desejada || maxH, maxH));
    } else {
      top = r.bottom + gap;
      maxH = espacoAbaixo;
    }
    setPos({ top: Math.round(top), left: Math.round(left), w, maxH: Math.max(140, Math.round(maxH)) });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: reposiciona só ao abrir.
  useLayoutEffect(() => {
    if (open) reposicionar();
  }, [open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: assina só ao abrir; reposicionar lê props/refs estáveis.
  useEffect(() => {
    if (!open) return;
    // `pointerdown` (não `mousedown`): no toque (iOS) tocar numa área vazia não gera evento de mouse — o painel não fechava.
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    // Esc fecha SÓ o painel: tratado na CAPTURA (antes do Modal em volta) e marcado como consumido — o Modal ignora. O
    // foco volta ao gatilho AQUI (`fechar`): o painel é desmontado antes de qualquer `onKeyDown` do conteúdo rodar (a
    // atualização do React é aplicada logo depois deste ouvinte).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      fechar();
    };
    const onMove = () => reposicionar();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  // Fecha; com o foco dentro do painel, ele volta ao gatilho (quem usa pode levá-lo a outro lugar logo depois).
  function fechar() {
    if (panelRef.current?.contains(document.activeElement)) triggerRef.current?.focus({ preventScroll: true });
    setOpen(false);
  }
  const painel = {
    ref: panelRef,
    className: `fixed z-[200] overflow-auto rounded-card border border-border bg-surface p-2 shadow-soft ${panelClassName}`,
    style: { top: pos.top, left: pos.left, width: pos.w, maxWidth: "calc(100vw - 16px)", maxHeight: pos.maxH },
  };
  // Só com o painel aberto (o conteúdo em função monta as listas só nessa hora).
  const conteudo = !open ? null : typeof children === "function" ? children(fechar, { teclado }) : children;

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        title={title}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup={papel === "dialog" ? "dialog" : "true"}
        aria-disabled={bloqueado || undefined}
        onClick={(e) => {
          if (bloqueado) return;
          setTeclado(e.detail === 0);
          setOpen((o) => !o);
        }}
        className={`inline-flex max-w-full items-center rounded-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${triggerClassName}`}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          // O diálogo tem nome (o do gatilho); o menu, como sempre.
          papel === "dialog" ? (
            <div role="dialog" aria-label={ariaLabel} {...painel}>
              {conteudo}
            </div>
          ) : (
            <div role="menu" {...painel}>
              {conteudo}
            </div>
          ),
          document.body,
        )}
    </div>
  );
}
