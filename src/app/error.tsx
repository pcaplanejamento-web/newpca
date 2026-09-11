"use client";

import { useEffect } from "react";
import Link from "next/link";
import { IconAlert } from "@/components/icons";

// Error boundary global (App Router): captura erros de renderização das páginas
// e oferece recuperação sem derrubar a aplicação inteira. Renderiza dentro do
// layout raiz (tema/fonte já aplicados).
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-6 py-16 text-center dark:bg-slate-950">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500/15 to-red-500/5 text-red-500 dark:from-red-500/20 dark:to-red-500/5 dark:text-red-300">
        <IconAlert className="h-8 w-8" />
      </div>
      <h1 className="mt-5 text-lg font-bold text-slate-800 dark:text-white">
        Algo deu errado
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
        Ocorreu um erro inesperado. Tente novamente; se continuar, recarregue a página.
      </p>
      {error.digest && (
        <p className="mt-1 font-mono text-xs text-slate-400">ref: {error.digest}</p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Tentar novamente
        </button>
        <Link
          href="/"
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Ir para o início
        </Link>
      </div>
    </div>
  );
}
