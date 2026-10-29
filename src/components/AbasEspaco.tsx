"use client";

import Link from "next/link";
import { IconChevronLeft } from "./icons";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ComponentProps, createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Segmented } from "./Segmented";
import { Skeleton, SkeletonLinhas } from "./Skeleton";

/** Onde a aba ativa põe as SUAS ferramentas (à direita das abas). `undefined` = fora de um `AbasEspaco`. */
const SlotFerramentas = createContext<HTMLElement | null | undefined>(undefined);

/**
 * FERRAMENTAS da aba (busca, exportar, ação principal…) — renderizadas NA MESMA LINHA das abas do `AbasEspaco`,
 * alinhadas à direita (portal para o slot da barra; o estado continua no componente da aba). Fora de um
 * `AbasEspaco` (ex.: catálogo do DS), ficam numa linha própria alinhada à direita.
 */
export function FerramentasAba({ children }: { children: ReactNode }) {
  const slot = useContext(SlotFerramentas);
  if (slot === undefined) return <div className="barra-ferramentas flex flex-wrap items-center gap-2">{children}</div>;
  return slot ? createPortal(children, slot) : null;
}

/** As ferramentas dos filhos ficam NO LUGAR (numa linha própria) — ex.: uma aba reaproveitada DENTRO de um banner. */
export function FerramentasNoLugar({ children }: { children: ReactNode }) {
  return <SlotFerramentas.Provider value={undefined}>{children}</SlotFerramentas.Provider>;
}

/**
 * A TROCA DE ABA de um espaço (a mesma do `AbasEspaco` e da pílula de vistas do quadro): a aba pedida (clique) vale até o
 * servidor devolvê-la (`?aba=`); depois, a do servidor (voltar/avançar do navegador seguem a aba do servidor).
 */
export function useTrocaAba<T extends string>(abaServidor: T) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pedida, setPedida] = useState<T | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: zera a pendência quando a aba do SERVIDOR muda.
  useEffect(() => setPedida(null), [abaServidor]);
  const aba = pedida ?? abaServidor;
  const trocar = (a: T) => {
    if (a === aba) return;
    setPedida(a);
    const p = new URLSearchParams(sp.toString());
    p.set("aba", a);
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  };
  return { aba, trocar };
}

/**
 * O CONTEÚDO da aba (com o morph); `slot` = onde vão as `FerramentasAba`; `className` = o arranjo dos blocos da aba (o
 * `AbasEspaco` põe o espaço padrão `--gap-block` entre eles). Enquanto a aba pedida não chega, a aba ANTERIOR fica
 * montada e o esqueleto só cobre o conteúdo se a espera passar do tempo do `.esqueleto-tela` — a aba que volta do
 * cache (ou chega rápido) troca direto, sem piscar.
 */
export function ConteudoAba({
  aba,
  abaServidor,
  slot,
  className = "",
  children,
}: {
  aba: string;
  abaServidor: string;
  slot: HTMLElement | null;
  className?: string;
  children: ReactNode;
}) {
  const esperando = aba !== abaServidor;
  return (
    <SlotFerramentas.Provider value={slot}>
      <div className="relative" aria-busy={esperando || undefined}>
        <div key={abaServidor} className={`animate-cat-morph ${className}`} inert={esperando || undefined}>
          {children}
        </div>
        {esperando ? (
          <div className="esqueleto-tela absolute inset-0 z-10 space-y-[var(--gap-block)] overflow-hidden bg-surface-2">
            <Skeleton className="h-24 w-full" />
            <SkeletonLinhas linhas={8} />
          </div>
        ) : null}
      </div>
    </SlotFerramentas.Provider>
  );
}

/**
 * ABAS de um ESPAÇO (PCA, Orçamento…): UMA barra (as abas à esquerda; à direita, as `FerramentasAba` da aba ativa) +
 * o conteúdo da aba no MESMO espaço, com o morph. O servidor monta SÓ a aba ativa (`?aba=`): trocar de aba navega e,
 * até ela chegar, mostra o esqueleto (voltar/avançar do navegador seguem a aba do servidor). Com `cabecalho`, a barra é
 * a linha do TÍTULO do espaço: o cabeçalho à esquerda e, à direita, as ferramentas da aba e as abas (no celular, o
 * cabeçalho numa linha e as abas na de baixo).
 */
export function AbasEspaco<T extends string>({
  aba: abaServidor,
  opcoes,
  voltar,
  fim,
  children,
}: {
  /** A aba que o servidor montou (`children`). */
  aba: T;
  /** `curto` = o rótulo nos telefones quando todas as abas não cabem; `soIcone` + `icone` = a aba só com o ícone. */
  opcoes: ComponentProps<typeof Segmented<T>>["options"];
  /** O VOLTAR do espaço — à esquerda das abas. O espaço não tem título: o nome está no caminho do cabeçalho. */
  voltar?: { href: string; rotulo: string };
  /** Ação do espaço no fim da linha (ex.: excluir o orçamento). */
  fim?: ReactNode;
  children: ReactNode;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const { aba, trocar } = useTrocaAba(abaServidor);
  return (
    <>
      {/* UMA linha: voltar · as abas · as ferramentas da aba (principais à esquerda, ícones à direita) · a ação do espaço. */}
      <div className="linha-topico flex flex-wrap items-center gap-2">
        {voltar && <BotaoVoltar href={voltar.href} rotulo={voltar.rotulo} />}
        <Segmented<T> value={aba} onChange={trocar} options={opcoes} />
        <div ref={setSlot} className="barra-ferramentas flex min-w-[min(100%,20rem)] flex-1 flex-wrap items-center gap-2 empty:hidden" />
        {fim && <div className="ml-auto flex items-center gap-2">{fim}</div>}
      </div>
      <ConteudoAba aba={aba} abaServidor={abaServidor} slot={slot} className="space-y-[var(--gap-block)]">
        {children}
      </ConteudoAba>
    </>
  );
}

/** O botão VOLTAR das telas internas (espaços, pastas, órgão): sempre o primeiro à esquerda da linha do topo. */
export function BotaoVoltar({ href, rotulo }: { href: string; rotulo: string }) {
  return (
    <Link
      href={href}
      aria-label={`Voltar para ${rotulo}`}
      title={`Voltar para ${rotulo}`}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-control border border-border-2 bg-surface text-text-2 transition-colors hover:bg-surface-2 hover:text-text lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
    >
      <IconChevronLeft className="h-4 w-4" />
    </Link>
  );
}
