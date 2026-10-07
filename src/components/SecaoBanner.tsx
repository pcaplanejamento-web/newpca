import type { ReactNode } from "react";

/**
 * As peças dos BANNERS de cadastro (usuário, órgão, unidade, responsável): a SEÇÃO (título + ação à direita + o conteúdo,
 * num contorno) e o VALOR só-leitura de um campo com cadeado.
 */
export function SecaoBanner({ titulo, acao, children }: { titulo: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-card border border-border p-[var(--pad-card)]">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13.5px] font-semibold text-text">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** O valor só-leitura de um campo com cadeado. */
export function ValorCampo({ children }: { children: ReactNode }) {
  return <div className="mt-0.5 min-h-[22px] break-words text-sm font-semibold leading-snug text-text">{children}</div>;
}
