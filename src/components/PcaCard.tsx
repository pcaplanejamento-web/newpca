import Link from "next/link";
import type { ReactNode } from "react";
import { brlCompact, num } from "@/lib/format";
import { type FontePca, ROTULO_FONTE, ROTULO_STATUS, type StatusPca } from "@/lib/pca-core";
import { Badge } from "./Badge";
import { IconPlus } from "./icons";

/**
 * CAPA do PCA na proporção 4:5 — a imagem escolhida (recorte WebP 800×1000) ou a CAPA PADRÃO
 * (degradê do accent + o ANO gigante em marca d'água). O conteúdo (`children`) fica sobre um véu
 * escuro no rodapé, legível em qualquer imagem e nos dois temas.
 */
export function PcaCapa({
  capa,
  ano,
  children,
  className = "",
}: {
  capa: string | null;
  ano: number | null;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative isolate aspect-[4/5] w-full overflow-hidden rounded-card bg-accent-soft [container-type:inline-size] ${className}`}>
      {capa ? (
        // biome-ignore lint/performance/noImgElement: capa = rota própria (já é o recorte WebP 800×1000) ou data-URL do recorte recém-feito; next/image não agrega.
        <img src={capa} alt="" loading="lazy" decoding="async" className="absolute inset-0 -z-10 h-full w-full object-cover" />
      ) : (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-[38%] -z-10 select-none text-center font-black leading-none tracking-tighter text-accent/25"
          // Proporcional à LARGURA da própria capa (container query): cabe no card e na miniatura do cabeçalho.
          style={{ fontSize: "30cqw" }}
        >
          {ano ?? "PCA"}
        </span>
      )}
      {/* Véu: legibilidade do texto branco sobre qualquer capa (inclusive a padrão). */}
      <span
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ background: "linear-gradient(to bottom, transparent 30%, var(--veu-capa) 100%)" }}
      />
      {children}
    </div>
  );
}

export type PcaCardDados = {
  id: number;
  nome: string;
  ano: number | null;
  fonte: FontePca;
  status: StatusPca;
  capa: string | null;
  total: number;
  itens: number;
  partes: number;
};

/** Card 4:5 do PCA (tela `/painel/pca`): status + fonte no topo; nome, Σ e contagens na base. */
export function PcaCard({ pca, onClick, href }: { pca: PcaCardDados; onClick?: () => void; href?: string }) {
  const parte = pca.fonte === "lista" ? `${num(pca.partes)} planilha(s)` : `${num(pca.partes)} protocolo(s)`;
  const conteudo = (
    <PcaCapa capa={pca.capa} ano={pca.ano} className="shadow-soft transition-transform duration-[var(--motion-duration)] group-hover:-translate-y-0.5">
      <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
        <Badge tone={pca.status === "publicado" ? "emerald" : "amber"} dot>
          {ROTULO_STATUS[pca.status]}
        </Badge>
        <span className="rounded-full bg-surface/90 px-2.5 py-0.5 text-[11px] font-semibold text-text shadow-ring">{ROTULO_FONTE[pca.fonte]}</span>
      </div>
      <div className="absolute inset-x-4 bottom-4 text-white">
        <div className="truncate text-base font-bold" title={pca.nome}>
          {pca.nome}
        </div>
        <div className="mt-0.5 text-2xl font-black tracking-tight">{brlCompact(pca.total)}</div>
        <div className="mt-0.5 text-xs text-white/80">
          {pca.fonte === "lista" ? `${num(pca.itens)} itens · ${parte}` : `${parte} · ${num(pca.itens)} itens`}
        </div>
      </div>
    </PcaCapa>
  );
  const cls =
    "group block w-full rounded-card text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/25";
  if (href)
    return (
      <Link href={href} className={cls} aria-label={`Abrir ${pca.nome}`}>
        {conteudo}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={cls} aria-label={`Abrir ${pca.nome}`}>
      {conteudo}
    </button>
  );
}

/** Card "+" no MESMO formato 4:5 — cria um PCA novo. */
export function PcaNovoCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-border-2 bg-surface text-muted transition-colors hover:border-accent/50 hover:bg-accent-soft/40 hover:text-accent focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
    >
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-surface-2 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
        <IconPlus className="h-6 w-6" />
      </span>
      <span className="text-sm font-semibold">Novo PCA</span>
    </button>
  );
}
