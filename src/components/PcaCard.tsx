import Link from "next/link";
import type { ReactNode } from "react";
import { brlCompact, num } from "@/lib/format";
import { type FontePca, ROTULO_FONTE, ROTULO_STATUS, type StatusPca } from "@/lib/pca-core";
import { CarregandoLink } from "./CarregandoLink";
import { IconDatabase, IconFile, IconPlus } from "./icons";

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
  /** PRÉVIA ligada: os números incluem os DFDs ainda não incorporados (enviados + marcados da Mesa do sistema). */
  previa?: boolean;
};

/** Pílula DISCRETA sobre a capa (status e fonte): a mesma altura e o mesmo vidro leve, legível em qualquer imagem. */
function PilulaCapa({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex h-[clamp(1.35rem,5.5cqw,1.6rem)] items-center gap-1.5 rounded-full bg-black/30 px-[clamp(0.5rem,2.5cqw,0.7rem)] font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm"
      style={{ fontSize: "clamp(0.65rem, 2.8cqw, 0.75rem)" }}
    >
      {children}
    </span>
  );
}

/** Card 4:5 do PCA (tela `/painel/pca`): status + fonte em pílulas discretas no topo; nome, Σ e contagens na base. */
export function PcaCard({ pca, onClick, href }: { pca: PcaCardDados; onClick?: () => void; href?: string }) {
  const parte = pca.fonte === "lista" ? `${num(pca.partes)} planilha(s)` : `${num(pca.partes)} protocolo(s)`;
  const IconeFonte = pca.fonte === "lista" ? IconDatabase : IconFile;
  const conteudo = (
    <PcaCapa capa={pca.capa} ano={pca.ano} className="shadow-soft transition-transform duration-[var(--motion-duration)] group-hover:-translate-y-0.5">
      <div className="absolute inset-x-[4cqw] top-[4cqw] flex items-start justify-between gap-2">
        <PilulaCapa>
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: pca.status === "publicado" ? "var(--ok)" : "var(--warn)" }}
          />
          {ROTULO_STATUS[pca.status]}
        </PilulaCapa>
        <PilulaCapa>
          <IconeFonte aria-hidden className="h-[1.05em] w-[1.05em] opacity-80" />
          {ROTULO_FONTE[pca.fonte]}
        </PilulaCapa>
      </div>
      {/* Rodapé: um degradê curto só na base (a arte da capa fica à vista) + o texto proporcional ao card. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-black/65 via-black/25 to-transparent" />
      <div className="absolute inset-x-[5cqw] bottom-[4.5cqw] text-white [text-shadow:0_1px_8px_rgb(0_0_0/0.35)]">
        <div className="truncate font-semibold leading-tight text-white/90" style={{ fontSize: "clamp(0.85rem, 4cqw, 1.1rem)" }} title={pca.nome}>
          {pca.nome}
        </div>
        <div className="mt-0.5 font-bold leading-none tracking-tight tabular-nums" style={{ fontSize: "clamp(1.25rem, 7.5cqw, 2rem)" }}>
          {brlCompact(pca.total)}
        </div>
        <div className="mt-1 truncate text-white/70" style={{ fontSize: "clamp(0.65rem, 2.9cqw, 0.8rem)" }}>
          {parte} · {num(pca.itens)} itens
          {pca.previa ? <span className="text-[var(--warn)]"> · prévia</span> : null}
        </div>
      </div>
    </PcaCapa>
  );
  const cls =
    "group block w-full max-w-[30rem] rounded-card text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/25";
  if (href)
    return (
      <Link href={href} className={`relative ${cls}`} aria-label={`Abrir ${pca.nome}`}>
        {conteudo}
        <CarregandoLink rotulo="Abrindo o PCA…" />
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
      className="group flex aspect-[4/5] w-full max-w-[30rem] flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-border-2 bg-surface text-muted transition-colors hover:border-accent/50 hover:bg-accent-soft/40 hover:text-accent focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
    >
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-surface-2 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
        <IconPlus className="h-6 w-6" />
      </span>
      <span className="text-sm font-semibold">Novo PCA</span>
    </button>
  );
}
