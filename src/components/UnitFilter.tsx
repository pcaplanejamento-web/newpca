"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ChangeEvent } from "react";
import { IconBuilding } from "./icons";

type U = { id: number; codigo: string; municipio: string };

export function UnitFilter({
  unidades,
  current,
}: {
  unidades: U[];
  current?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function onChange(e: ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    const params = new URLSearchParams(sp.toString());
    if (v) params.set("unidade", v);
    else params.delete("unidade");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <label className="flex items-center gap-2 rounded-control border border-border-2 bg-surface px-3 py-2 text-sm">
      <IconBuilding className="h-[18px] w-[18px] shrink-0 text-faint" />
      <span className="hidden shrink-0 text-muted sm:inline">Unidade:</span>
      <select
        value={current ?? ""}
        onChange={onChange}
        className="min-w-0 flex-1 bg-transparent font-medium text-text outline-none"
      >
        <option value="">Todas as unidades</option>
        {unidades.map((u) => (
          <option key={u.id} value={u.id}>
            {u.municipio} — {u.codigo}
          </option>
        ))}
      </select>
    </label>
  );
}
