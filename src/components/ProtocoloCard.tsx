import { Avatar } from "./Avatar";
import { NaturezaTag, SituacaoDot } from "./StatusTag";
import { dataBR } from "@/lib/format";
import type { ProtocoloLista } from "@/lib/protocolos";

/** Card de protocolo (apresentação mobile da tabela). Por token. */
export function ProtocoloCard({
  p,
  situacaoLabel,
  onClick,
}: {
  p: ProtocoloLista;
  situacaoLabel: string;
  onClick?: () => void;
}) {
  const clickable = typeof onClick === "function";
  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={`rounded-card border border-border bg-surface p-4 shadow-ring transition-colors ${
        clickable ? "cursor-pointer hover:border-border-2 active:scale-[0.99]" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-bold text-text">{p.numero}</span>
        <SituacaoDot situacao={p.situacao} label={situacaoLabel} />
      </div>

      <div className="mt-2 min-w-0">
        <div className="truncate text-sm font-semibold text-text">{p.orgao ?? "—"}</div>
        <div className="mt-0.5 text-xs text-muted">
          {[p.orgaoSigla, p.data ? dataBR(p.data) : null].filter(Boolean).join(" · ") || "—"}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        {p.natureza ? (
          <NaturezaTag natureza={p.natureza} />
        ) : (
          <span className="text-xs text-faint">Sem natureza</span>
        )}
        {p.responsavel ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-text-2">{p.responsavel}</span>
            <Avatar nome={p.responsavel} size="sm" />
          </div>
        ) : (
          <span className="text-xs text-faint">—</span>
        )}
      </div>
    </div>
  );
}
