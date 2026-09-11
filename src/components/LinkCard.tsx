import Link from "next/link";
import type { ReactNode } from "react";
import { IconChevronRight } from "./icons";

// Card de navegação do design system (ícone + título + descrição + chevron).
// Fonte única dos "cards de atalho/ferramenta". Por token; ícone em accent.
export function LinkCard({
  href,
  titulo,
  descricao,
  icon,
}: {
  href: string;
  titulo: string;
  descricao?: string;
  icon?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-card border border-border bg-surface p-5 shadow-ring transition hover:border-border-2 hover:shadow-soft"
    >
      {icon && (
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-white">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-text">{titulo}</h3>
          <IconChevronRight className="h-4 w-4 shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-muted" />
        </div>
        {descricao && <p className="mt-1 text-sm text-muted">{descricao}</p>}
      </div>
    </Link>
  );
}
