"use client";

import { type ButtonHTMLAttributes, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EstadoDropdown } from "./SetaDropdown";

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
// `papel="listbox"` = a lista de uma SELEÇÃO (`Selecao`): o painel não tem papel próprio (a lista dentro dele tem) e o
// gatilho perde o desenho de chip (a caixa vem toda do `triggerClassName`). `gatilho` = atributos a mais do botão
// (teclado, foco, `role`/`aria-*`, `disabled`) — o clique segue com o Dropdown. `ancora` = o elemento em que o painel se
// alinha (borda esquerda e largura — ex.: a CAIXA inteira de um campo com o rótulo dentro); `folha` = o painel sobe de
// BAIXO, na largura da tela, sobre um fundo escuro (listas grandes no celular).
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
  aberto,
  onAberto,
  gatilho,
  ancora,
  folha = false,
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
  papel?: "menu" | "dialog" | "listbox";
  bloqueado?: boolean;
  /** CONTROLADO por fora (ex.: abrir a lista do chat a partir de uma bolha): o estado aberto e quem o muda. */
  aberto?: boolean;
  onAberto?: (aberto: boolean) => void;
  gatilho?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "className" | "type" | "id">;
  ancora?: RefObject<HTMLElement | null>;
  folha?: boolean;
}) {
  const [openInterno, setOpenInterno] = useState(false);
  const open = aberto ?? openInterno;
  const openRef = useRef(open);
  openRef.current = open;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => {
    const novo = typeof v === "function" ? v(openRef.current) : v;
    if (aberto === undefined) setOpenInterno(novo);
    onAberto?.(novo);
  };
  // Aberto pelo teclado (o clique de Enter/Espaço tem `detail` 0): quem usa leva o foco para dentro do painel.
  const [teclado, setTeclado] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, w: 224, maxH: 520 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // O lado (acima/abaixo) é decidido UMA vez ao abrir: o conteúdo que muda depois (marcar um item, a busca) nunca faz o
  // painel trocar de lado nem "pular" — ele segue PRESO ao gatilho.
  const acimaRef = useRef<boolean | null>(null);
  // O mesmo lado, em estado: a SETA do gatilho (`SetaDropdown`) aponta para o lado oposto.
  const [acima, setAcima] = useState(false);

  // Posiciona o painel (fixed) e decide abrir para BAIXO ou para CIMA conforme o
  // espaço disponível; sempre limita a altura à viewport (rola por dentro). Assim
  // o filtro NUNCA é cortado, mesmo quando o gatilho está no rodapé da tela.
  const reposicionar = () => {
    const el = ancora?.current ?? triggerRef.current;
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
    if (acimaRef.current == null) {
      acimaRef.current = espacoAbaixo < Math.min(desejada || 320, 360) && espacoAcima > espacoAbaixo;
      setAcima(acimaRef.current);
    }
    let top: number;
    let maxH: number;
    if (acimaRef.current) {
      // Acima: a BASE do painel encosta no gatilho (a altura real dele — mudou o conteúdo, a base continua no lugar).
      maxH = espacoAcima;
      top = Math.max(8, r.top - gap - Math.min(desejada || maxH, maxH));
    } else {
      top = r.bottom + gap;
      maxH = espacoAbaixo;
    }
    const novo = { top: Math.round(top), left: Math.round(left), w, maxH: Math.max(140, Math.round(maxH)) };
    // Sem re-render quando nada mudou (roda a cada quadro enquanto aberto).
    setPos((p) => (p.top === novo.top && p.left === novo.left && p.w === novo.w && p.maxH === novo.maxH ? p : novo));
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: reposiciona só ao abrir.
  useLayoutEffect(() => {
    if (!open) {
      acimaRef.current = null;
      return;
    }
    reposicionar();
    // Enquanto aberto, o painel ACOMPANHA o gatilho e o próprio tamanho: um banner que cresce/recentraliza (ex.: o
    // rodapé de um Modal muda de altura ao marcar um item), uma rolagem ou a lista que encolhe nunca o deixam solto.
    let quadro = 0;
    const seguir = () => {
      reposicionar();
      quadro = requestAnimationFrame(seguir);
    };
    quadro = requestAnimationFrame(seguir);
    return () => cancelAnimationFrame(quadro);
  }, [open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: assina só ao abrir.
  useEffect(() => {
    if (!open) return;
    // `pointerdown` (não `mousedown`): no toque (iOS) tocar numa área vazia não gera evento de mouse — o painel não fechava.
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      // Os AVISOS FLUTUANTES (a confirmação, o "Desfazer") e as JANELAS FLUTUANTES abertas a partir do painel (ex.: as
      // Novidades ao lado do sino) nascem de dentro dele: tocá-los não o fecha.
      if ((t as Element).closest?.(".avisos-flutuantes, [data-sobre-dropdown]")) return;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    // Esc fecha SÓ o painel: tratado na CAPTURA (antes do Modal em volta) e marcado como consumido — o Modal ignora. O
    // foco volta ao gatilho AQUI (`fechar`): o painel é desmontado antes de qualquer `onKeyDown` do conteúdo rodar (a
    // atualização do React é aplicada logo depois deste ouvinte).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Uma janela flutuante aberta POR CIMA fecha antes (ela trata o Esc).
      if (document.querySelector("[data-sobre-dropdown]")) return;
      e.preventDefault();
      fechar();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  // Fecha; com o foco dentro do painel, ele volta ao gatilho (quem usa pode levá-lo a outro lugar logo depois).
  function fechar() {
    if (panelRef.current?.contains(document.activeElement)) triggerRef.current?.focus({ preventScroll: true });
    setOpen(false);
  }
  const painel = folha
    ? {
        ref: panelRef,
        className: `fixed inset-x-0 bottom-0 z-[200] max-h-[80dvh] overflow-auto rounded-t-card border-t border-border bg-surface px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-soft ${panelClassName}`,
        style: undefined,
      }
    : {
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
        aria-haspopup={papel === "menu" ? "true" : papel}
        aria-disabled={bloqueado || undefined}
        {...gatilho}
        onClick={(e) => {
          if (bloqueado || gatilho?.disabled) return;
          setTeclado(e.detail === 0);
          setOpen((o) => !o);
        }}
        className={
          papel === "listbox"
            ? `min-w-0 text-left ${triggerClassName}`
            : `inline-flex max-w-full items-center rounded-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${triggerClassName}`
        }
      >
        <EstadoDropdown.Provider value={{ aberto: open, acima: acima && !folha }}>{trigger}</EstadoDropdown.Provider>
      </button>
      {open &&
        createPortal(
          // O diálogo tem nome (o do gatilho); o menu, como sempre.
          papel === "dialog" ? (
            <div role="dialog" aria-label={ariaLabel} {...painel}>
              {conteudo}
            </div>
          ) : papel === "listbox" ? (
            <>
              {/* A FOLHA tem o fundo escuro (tocar nele fecha — é "fora" do painel). */}
              {folha && <div aria-hidden="true" className="animate-fundo-folha fixed inset-0 z-[199] bg-[var(--scrim)]" />}
              <div role="none" {...painel}>
                {conteudo}
              </div>
            </>
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
