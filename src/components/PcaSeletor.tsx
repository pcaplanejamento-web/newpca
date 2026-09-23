"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconBox } from "./icons";

/**
 * Seletor (dropdown) do PCA PUBLICADO na tela inicial — troca `?pca=` e limpa o filtro de unidade
 * (as unidades são de cada PCA). Mesmo visual do `UnitFilter`.
 */
export function PcaSeletor({ pcas, current }: { pcas: { id: number; nome: string }[]; current: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <label className="flex items-center gap-2 rounded-control border border-border-2 bg-surface px-3 py-2 text-sm">
      <IconBox className="h-[18px] w-[18px] shrink-0 text-faint" />
      <span className="hidden shrink-0 text-muted sm:inline">PCA:</span>
      <select
        value={current}
        onChange={(e) => {
          const params = new URLSearchParams(sp.toString());
          params.set("pca", e.target.value);
          params.delete("unidade");
          router.push(`${pathname}?${params.toString()}`);
        }}
        className="min-w-0 flex-1 bg-transparent font-medium text-text outline-none"
        aria-label="PCA"
      >
        {pcas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </select>
    </label>
  );
}
