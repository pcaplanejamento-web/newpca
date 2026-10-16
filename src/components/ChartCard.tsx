import type { ReactNode } from "react";
import { IconAmpliar } from "./icons";

type Props = {
  /** Sem título (nem ação/expandir), o cartão não tem cabeçalho — o conteúdo traz a própria linha. */
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  /** Abrir o gráfico expandido (o explorador): o ícone no canto, ao lado da `action`. */
  onExpandir?: () => void;
};

export function ChartCard({ title, subtitle, children, className, action, onExpandir }: Props) {
  return (
    <div className={`rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring ${className ?? ""}`}>
      {(title || action || onExpandir) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
          </div>
          {(action || onExpandir) && (
            <div className="flex shrink-0 items-center gap-1">
              {action}
              {onExpandir && (
                <button
                  type="button"
                  onClick={onExpandir}
                  aria-label={`Expandir: ${title ?? "gráfico"}`}
                  title="Expandir — ranking, detalhe e tabela"
                  className="grid h-8 w-8 place-items-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 pointer-coarse:h-11 pointer-coarse:w-11"
                >
                  <IconAmpliar className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
