import { Avatar } from "./Avatar";
import { Badge, naturezaTone, situacaoTone } from "./Badge";
import { dataBR } from "@/lib/format";
import type { ProtocoloLista } from "@/lib/protocolos";

/** Card de protocolo (apresentação mobile da tabela). */
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
                onClick!();
              }
            }
          : undefined
      }
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition dark:border-slate-800 dark:bg-slate-900 ${
        clickable
          ? "cursor-pointer hover:border-slate-300 hover:shadow active:scale-[0.99] dark:hover:border-slate-700"
          : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
          {p.numero}
        </span>
        <Badge tone={situacaoTone(p.situacao)} dot>
          {situacaoLabel}
        </Badge>
      </div>

      <div className="mt-2 min-w-0">
        <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
          {p.orgao ?? "—"}
        </div>
        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {[p.orgaoSigla, p.data ? dataBR(p.data) : null].filter(Boolean).join(" · ") || "—"}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        {p.natureza ? (
          <Badge tone={naturezaTone(p.natureza)} dot>{p.natureza}</Badge>
        ) : (
          <span className="text-xs text-slate-400">Sem natureza</span>
        )}
        {p.responsavel ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {p.responsavel}
            </span>
            <Avatar nome={p.responsavel} size="sm" />
          </div>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </div>
    </div>
  );
}
