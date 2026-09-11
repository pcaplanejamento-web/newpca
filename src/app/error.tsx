"use client";

import { useEffect } from "react";
import Link from "next/link";
import { IconAlert } from "@/components/icons";

// Error boundary global (App Router): captura erros de renderização das páginas
// e oferece recuperação sem derrubar a aplicação inteira. Renderiza dentro do
// layout raiz (tema/fonte já aplicados).
export default function ErrorBoundary({
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
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-2 px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500/15 to-red-500/5 text-red-500 dark:from-red-500/20 dark:to-red-500/5 dark:text-red-300">
        <IconAlert className="h-8 w-8" />
      </div>
      <h1 className="mt-5 text-lg font-bold text-text">Algo deu errado</h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        Ocorreu um erro inesperado. Tente novamente; se continuar, recarregue a página.
      </p>
      {error.digest && (
        <p className="mt-1 font-mono text-xs text-faint">ref: {error.digest}</p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-text px-4 py-2.5 text-sm font-semibold text-surface transition hover:opacity-90"
        >
          Tentar novamente
        </button>
        <Link
          href="/"
          className="rounded-lg border border-border-2 px-4 py-2.5 text-sm font-semibold text-text-2 transition hover:bg-surface-2"
        >
          Ir para o início
        </Link>
      </div>
    </div>
  );
}
