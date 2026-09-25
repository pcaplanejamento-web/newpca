import Link from "next/link";
import { brlCompact, dataBR, num } from "@/lib/format";
import type { OrcamentoResumo } from "@/lib/orcamento";
import { dotacaoAtualizada, pctEmpenhado } from "@/lib/orcamento-indicadores";
import { Badge } from "./Badge";
import { IconPlus } from "./icons";

/**
 * Card 4:5 do ORÇAMENTO (tela `/painel/orcamento`) — só INFORMAÇÃO, sem imagem: ano e nome no topo; a dotação
 * ATUALIZADA (inicial + suplementação − anulação) em destaque com a barra do % EMPENHADO; empenhado e saldo; e, no
 * rodapé, a abrangência (órgãos · unidades · lançamentos) e a data da importação. Clicar abre a tela do orçamento.
 */
export function OrcamentoCard({ orcamento: o, href }: { orcamento: OrcamentoResumo; href: string }) {
  const pct = pctEmpenhado(o);
  return (
    <Link
      href={href}
      aria-label={`Abrir ${o.nome}`}
      className="group flex aspect-[4/5] w-full flex-col rounded-card border border-border bg-surface p-3 text-left shadow-ring transition-colors duration-[var(--motion-duration)] hover:border-accent/50 focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/25 sm:p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">Orçamento</span>
        <Badge tone="blue">{o.ano}</Badge>
      </div>
      <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-text group-hover:text-accent" title={o.nome}>
        {o.nome}
      </h3>

      <div className="mt-auto">
        <p className="text-[11px] text-muted">Dotação atualizada</p>
        <p className="text-xl font-bold tabular-nums tracking-tight text-text sm:text-2xl">{brlCompact(dotacaoAtualizada(o))}</p>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Empenhado"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-2 text-[11px]">
          <div className="min-w-0">
            <dt className="text-muted">Empenhado · {Math.round(pct)}%</dt>
            <dd className="truncate font-semibold tabular-nums text-text-2">{brlCompact(o.empenho)}</dd>
          </div>
          <div className="min-w-0 text-right">
            <dt className="text-muted">Saldo</dt>
            <dd className="truncate font-semibold tabular-nums text-text-2">{brlCompact(o.saldo)}</dd>
          </div>
        </dl>
      </div>

      <p className="mt-3 truncate border-t border-border pt-2 text-[11px] text-muted">
        {num(o.orgaos)} órgãos · {num(o.unidades)} unidades · {num(o.totalItens)} lanç.
        {o.atualizadoEm ? ` · ${dataBR(o.atualizadoEm)}` : ""}
      </p>
    </Link>
  );
}

/** Card "+" no MESMO formato 4:5 — importa um orçamento novo (CUBO). */
export function OrcamentoNovoCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border-2 bg-surface text-muted transition-colors hover:border-accent/50 hover:text-accent focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
    >
      <span className="grid h-10 w-10 place-items-center rounded-control bg-surface-2 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
        <IconPlus className="h-5 w-5" />
      </span>
      <span className="text-sm font-semibold">Importar orçamento</span>
    </button>
  );
}
