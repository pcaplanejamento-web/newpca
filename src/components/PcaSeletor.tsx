"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Dropdown } from "./Dropdown";
import { ehDesktop } from "./espacamento";
import { IconBox } from "./icons";
import { PcaCard, type PcaCardDados } from "./PcaCard";
import { SetaDropdown } from "./SetaDropdown";

/**
 * Seletor do PCA PUBLICADO na tela pública: o gatilho no visual dos controles do cabeçalho e, aberto, os CARTÕES (banners)
 * de cada PCA — tocar num deles vai ao PCA mantendo a aba e limpando o filtro de unidade (as unidades são de cada PCA).
 * No celular o painel sobe de baixo (folha).
 */
export function PcaSeletor({ pcas, current }: { pcas: PcaCardDados[]; current: number }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const [aberto, setAberto] = useState(false);
  const [folha, setFolha] = useState(false);
  const atual = pcas.find((p) => p.id === current);
  const href = (id: number) => {
    const q = new URLSearchParams(sp.toString());
    q.set("pca", String(id));
    q.delete("unidade");
    return `${pathname}?${q.toString()}`;
  };
  return (
    <Dropdown
      papel="dialog"
      className="min-w-0"
      ariaLabel="Escolher o PCA"
      title="Escolher o PCA"
      folha={folha}
      aberto={aberto}
      onAberto={(v) => {
        if (v) setFolha(!ehDesktop());
        setAberto(v);
      }}
      panelClassName={folha ? "animate-folha-sobe" : "animate-selecao-entra"}
      triggerClassName="flex h-11 min-w-0 max-w-full items-center gap-2 rounded-control border border-border-2 bg-surface px-3 text-sm lg:h-[var(--h-control-sm)]"
      trigger={
        <>
          <IconBox className="h-[18px] w-[18px] shrink-0 text-faint" />
          <span className="hidden shrink-0 text-muted sm:inline">PCA:</span>
          <span className="min-w-0 truncate font-medium text-text">{atual?.nome ?? "Escolher"}</span>
          <SetaDropdown className="h-4 w-4 shrink-0 text-muted" />
        </>
      }
    >
      {(fechar) => (
        <div className={`max-h-[70vh] overflow-y-auto p-[var(--pad-card)] ${folha ? "w-full" : "w-[min(44rem,calc(100vw-2rem))]"}`}>
          <p className="mb-3 text-sm font-semibold text-text">Escolha o PCA</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))] gap-[var(--gap-block)]" role="none" onClickCapture={() => fechar()}>
            {pcas.map((p) => (
              <div key={p.id} className={`rounded-card ${p.id === current ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""}`}>
                <PcaCard pca={p} href={href(p.id)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </Dropdown>
  );
}
