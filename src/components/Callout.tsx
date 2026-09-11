import type { ReactNode } from "react";
import type { Feedback } from "@/lib/semantic";

// Banner de feedback (info/sucesso/alerta/erro) do design system. Cor pelo token
// de feedback (--ok/--warn/--danger/--info); fundo/contorno por color-mix na
// superfície (adapta ao tema). Fonte única para avisos/erros nas telas.
export function Callout({
  kind = "info",
  icon,
  children,
  className = "",
}: {
  kind?: Feedback;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const c = `var(--${kind})`;
  return (
    <div
      className={`flex items-start gap-2 rounded-control p-3 text-sm ${className}`}
      style={{
        color: c,
        background: `color-mix(in srgb, ${c} 10%, var(--surface))`,
        border: `1px solid color-mix(in srgb, ${c} 28%, transparent)`,
      }}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <span className="min-w-0">{children}</span>
    </div>
  );
}
