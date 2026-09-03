"use client";

import { useRouter, useSearchParams } from "next/navigation";
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
  const sp = useSearchParams();

  function onChange(e: ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    const params = new URLSearchParams(sp.toString());
    if (v) params.set("unidade", v);
    else params.delete("unidade");
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  return (
    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <IconBuilding className="h-[18px] w-[18px] shrink-0 text-slate-400" />
      <span className="hidden shrink-0 text-slate-500 sm:inline dark:text-slate-400">
        Unidade:
      </span>
      <select
        value={current ?? ""}
        onChange={onChange}
        className="min-w-0 flex-1 bg-transparent font-medium text-slate-800 outline-none dark:text-slate-100"
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
