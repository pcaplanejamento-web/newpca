"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
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

/**
 * ABAS de um ESPAÇO (PCA, Orçamento…): UMA barra (as abas à esquerda; à direita, as `FerramentasAba` da aba ativa) +
 * o conteúdo da aba no MESMO espaço, com o morph. O servidor monta SÓ a aba ativa (`?aba=`): trocar de aba navega e,
 * até ela chegar, mostra o esqueleto (voltar/avançar do navegador seguem a aba do servidor).
 */
export function AbasEspaco<T extends string>({
  aba: abaServidor,
  opcoes,
  children,
}: {
  /** A aba que o servidor montou (`children`). */
  aba: T;
  opcoes: { value: T; label: string }[];
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // A aba pedida (clique) até o servidor devolvê-la; depois vale a do servidor.
  const [pedida, setPedida] = useState<T | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: zera a pendência quando a aba do SERVIDOR muda.
  useEffect(() => setPedida(null), [abaServidor]);
  const aba = pedida ?? abaServidor;

  const trocarAba = (a: T) => {
    if (a === aba) return;
    setPedida(a);
    const p = new URLSearchParams(sp.toString());
    p.set("aba", a);
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<T> value={aba} onChange={trocarAba} options={opcoes} />
        <div ref={setSlot} className="flex min-w-[min(100%,20rem)] flex-1 flex-wrap items-center justify-end gap-2 empty:hidden" />
      </div>
      {aba === abaServidor ? (
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
      )}
    </>
  );
}
