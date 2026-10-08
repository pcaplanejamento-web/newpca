"use client";

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
  if (slot === undefined) return <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>;
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

/** O CONTEÚDO da aba (com o morph) — ou o esqueleto até a aba pedida chegar; `slot` = onde vão as `FerramentasAba`. */
export function ConteudoAba({ aba, abaServidor, slot, children }: { aba: string; abaServidor: string; slot: HTMLElement | null; children: ReactNode }) {
  return aba === abaServidor ? (
    <SlotFerramentas.Provider value={slot}>
      <div key={aba} className="animate-cat-morph">
        {children}
      </div>
    </SlotFerramentas.Provider>
  ) : (
    <div className="space-y-[var(--gap-block)]" aria-busy="true">
      <Skeleton className="h-24 w-full" />
      <SkeletonLinhas linhas={8} />
    </div>
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
  cabecalho,
  children,
}: {
  /** A aba que o servidor montou (`children`). */
  aba: T;
  /** `curto` = o rótulo nos telefones quando todas as abas não cabem; `soIcone` + `icone` = a aba só com o ícone. */
  opcoes: ComponentProps<typeof Segmented<T>>["options"];
  /** O título do espaço (voltar · nome · selos) — na MESMA linha das abas, à esquerda. */
  cabecalho?: ReactNode;
  children: ReactNode;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const { aba, trocar } = useTrocaAba(abaServidor);
  const abas = <Segmented<T> value={aba} onChange={trocar} options={opcoes} />;
  return (
    <>
      {cabecalho ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-[1_1_16rem] items-center gap-x-2">{cabecalho}</div>
          <div className="ml-auto flex max-w-full min-w-0 flex-wrap items-center justify-end gap-2">
            <div ref={setSlot} className="flex min-w-0 items-center justify-end gap-2 empty:hidden" />
            {abas}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {abas}
          <div ref={setSlot} className="flex min-w-[min(100%,20rem)] flex-1 flex-wrap items-center justify-end gap-2 empty:hidden" />
        </div>
      )}
      <ConteudoAba aba={aba} abaServidor={abaServidor} slot={slot}>
        {children}
      </ConteudoAba>
    </>
  );
}
