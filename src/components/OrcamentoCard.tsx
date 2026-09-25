import Link from "next/link";
import { brlCompact, dataBR, num } from "@/lib/format";
import type { OrcamentoResumo } from "@/lib/orcamento";
import { Badge } from "./Badge";
import { IconPlus } from "./icons";
import { PcaCapa } from "./PcaCard";

/**
 * Card 4:5 do ORÇAMENTO (tela `/painel/orcamento`) — a MESMA capa do PCA (`PcaCapa`: degradê do accent +
 * o ANO em marca d'água), com o ano no topo e, na base, o nome, a dotação inicial (Σ) e os lançamentos.
 * Clicar abre a tela do orçamento (`/painel/orcamento/[id]`).
 */
export function OrcamentoCard({ orcamento: o, href }: { orcamento: OrcamentoResumo; href: string }) {
  return (
    <Link
      href={href}
      aria-label={`Abrir ${o.nome}`}
      className="group block w-full rounded-card text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/25"
    >
      <PcaCapa capa={null} ano={o.ano} className="shadow-soft transition-transform duration-[var(--motion-duration)] group-hover:-translate-y-0.5">
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <Badge tone="blue">{o.ano}</Badge>
          {o.atualizadoEm && (
            <span className="rounded-full bg-surface/90 px-2.5 py-0.5 text-[11px] font-semibold text-text shadow-ring">{dataBR(o.atualizadoEm)}</span>
          )}
        </div>
        <div className="absolute inset-x-4 bottom-4 text-white">
          <div className="truncate text-base font-bold" title={o.nome}>
            {o.nome}
          </div>
          <div className="mt-0.5 text-2xl font-black tracking-tight">{brlCompact(o.valorInicial)}</div>
          <div className="mt-0.5 text-xs text-white/80">
            Dotação inicial · {num(o.totalItens)} {o.totalItens === 1 ? "lançamento" : "lançamentos"}
          </div>
        </div>
      </PcaCapa>
    </Link>
  );
}

/** Card "+" no MESMO formato 4:5 — importa um orçamento novo (CUBO). */
export function OrcamentoNovoCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-border-2 bg-surface text-muted transition-colors hover:border-accent/50 hover:bg-accent-soft/40 hover:text-accent focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
    >
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-surface-2 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
        <IconPlus className="h-6 w-6" />
      </span>
      <span className="text-sm font-semibold">Importar orçamento</span>
    </button>
  );
}
