import type { ReactNode } from "react";
import { IconChevronLeft } from "./icons";
import Link from "next/link";

/** Placeholder consistente para abas ainda em desenvolvimento (fases 2/3). */
export function EmConstrucao({
  titulo,
  descricao,
  icon,
  fase,
  itens,
}: {
  titulo: string;
  descricao: string;
  icon: ReactNode;
  fase?: string;
  itens?: string[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">{titulo}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{descricao}</p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 text-emerald-500 dark:from-emerald-500/20 dark:to-emerald-500/5 dark:text-emerald-300">
          {icon}
        </div>
        <h3 className="mt-5 text-base font-bold text-slate-800 dark:text-white">
          Em construção
        </h3>
        {fase && (
          <span className="mt-2 inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            {fase}
          </span>
        )}
        <p className="mt-3 max-w-md text-sm text-slate-500 dark:text-slate-400">
          Esta aba já faz parte da navegação e será ativada em breve, sem afetar o
          restante da plataforma.
        </p>
        {itens && itens.length > 0 && (
          <ul className="mt-4 space-y-1 text-left text-sm text-slate-500 dark:text-slate-400">
            {itens.map((i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                {i}
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/painel"
          className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-emerald-600 transition hover:text-emerald-700 dark:text-emerald-400"
        >
          <IconChevronLeft className="h-4 w-4" /> Voltar ao Dashboard
        </Link>
      </div>
    </div>
  );
}
