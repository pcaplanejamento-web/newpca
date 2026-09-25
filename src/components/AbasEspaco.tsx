"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { Segmented } from "./Segmented";
import { Skeleton, SkeletonLinhas } from "./Skeleton";

/**
 * ABAS de um ESPAÇO (PCA, Orçamento…): `Segmented` + o conteúdo da aba no MESMO espaço, com o morph.
 * O servidor monta SÓ a aba ativa (`?aba=`): trocar de aba navega e, até ela chegar, mostra o esqueleto
 * (voltar/avançar do navegador seguem a aba do servidor).
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
      <Segmented<T> value={aba} onChange={trocarAba} options={opcoes} />
      {aba === abaServidor ? (
        <div key={aba} className="animate-cat-morph">
          {children}
        </div>
      ) : (
        <div className="space-y-[var(--gap-block)]" aria-busy="true">
          <Skeleton className="h-24 w-full" />
          <SkeletonLinhas linhas={8} />
        </div>
      )}
    </>
  );
}
