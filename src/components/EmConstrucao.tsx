import Link from "next/link";
import type { ReactNode } from "react";
import { IconChevronLeft } from "./icons";

/** Placeholder consistente para abas ainda em desenvolvimento. Por token. */
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
        <h2 className="text-lg font-bold text-text">{titulo}</h2>
        <p className="text-sm text-muted">{descricao}</p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border-2 bg-surface px-6 py-14 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-card bg-accent-soft text-accent">
          {icon}
        </div>
        <h3 className="mt-5 text-base font-bold text-text">Em construção</h3>
        {fase && (
          <span className="mt-2 inline-flex items-center rounded-pill bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
            {fase}
          </span>
        )}
        <p className="mt-3 max-w-md text-sm text-muted">
          Esta aba já faz parte da navegação e será ativada em breve, sem afetar o restante da
          plataforma.
        </p>
        {itens && itens.length > 0 && (
          <ul className="mt-4 space-y-1 text-left text-sm text-muted">
            {itens.map((i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {i}
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/painel"
          className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:opacity-80"
        >
          <IconChevronLeft className="h-4 w-4" /> Voltar ao Dashboard
        </Link>
      </div>
    </div>
  );
}
