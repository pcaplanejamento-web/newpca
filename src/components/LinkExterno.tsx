import type { ReactNode } from "react";

/**
 * Link EXTERNO do design system — abre em nova aba com `rel="noopener noreferrer"`.
 * É o ÚNICO ponto do app que renderiza uma âncora externa (o `Button href` usa
 * `next/link`, interno). Use só para URLs oficiais/externas (ex.: verificação de
 * assinatura digital no site da Prefeitura). Estilo idêntico ao `Button` secundário.
 */
export function LinkExterno({
  href,
  children,
  icon,
  className = "",
}: {
  href: string;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex h-[var(--h-control)] shrink-0 items-center justify-center gap-2 rounded-control border border-border-2 bg-surface px-4 text-[13.5px] font-semibold text-text transition-[background-color,opacity,box-shadow] duration-[var(--motion-duration)] hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${className}`}
    >
      {icon}
      {children}
    </a>
  );
}
