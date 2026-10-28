import Link from "next/link";
import type { ReactNode } from "react";
import { brl, dataBR, num } from "@/lib/format";
import type { OrcamentoResumo } from "@/lib/orcamento";
import { dotacaoAtualizada, pctEmpenhado } from "@/lib/orcamento-indicadores";
import { IconPlus, IconWallet } from "./icons";
import { Skeleton } from "./Skeleton";

/** A GRADE dos cards de orçamento (`auto-fill`, card de no mínimo 20rem) — a MESMA na tela e no esqueleto. */
export const GRADE_ORCAMENTOS = "grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-[var(--gap-block)]";

/** Uma linha "rótulo ........ valor completo" — o valor nunca é cortado: sem espaço, desce para a linha de baixo. */
function Linha({ rotulo, valor, sinal, tom }: { rotulo: string; valor: number; sinal?: "+" | "−"; tom?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="text-muted">{rotulo}</dt>
      <dd className={`font-medium tabular-nums ${tom ?? "text-text-2"}`}>
        {sinal && valor ? `${sinal} ` : ""}
        {brl(valor)}
      </dd>
    </div>
  );
}

/** Um número da abrangência (completo, sem abreviar). */
function Numero({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="rounded-control bg-surface-2 px-2 py-1.5 text-center">
      <p className="text-[13px] font-semibold tabular-nums text-text">{num(valor)}</p>
      <p className="text-[11px] text-muted">{rotulo}</p>
    </div>
  );
}

/** Uma linha da composição do `CartaoFinanceiro` (valor completo; `sinal` só com valor). */
export type LinhaFinanceira = { rotulo: string; valor: number; sinal?: "+" | "−"; tom?: string } | "divisor";

/**
 * O CARTÃO FINANCEIRO — a moldura do card do orçamento, reutilizada pelo card de empenhos: ícone + sobretítulo + nome
 * inteiro + o selo no canto; o valor em DESTAQUE completo; a barra (%); a composição em linhas completas; os números da
 * abrangência e o rodapé. Nenhum texto é cortado: o que não cabe, quebra.
 */
export function CartaoFinanceiro({
  href,
  icone,
  sobretitulo,
  nome,
  selo,
  destaque,
  barra,
  linhas,
  numeros,
  rodape,
  onClick,
}: {
  /** O endereço que o card abre — ou `onClick` (abrir no mesmo lugar, sem navegar). */
  href?: string;
  onClick?: () => void;
  icone: ReactNode;
  sobretitulo: string;
  nome: string;
  selo?: ReactNode;
  destaque: { rotulo: string; valor: number };
  barra: { rotulo: string; pct: number; texto: string };
  linhas: LinhaFinanceira[];
  numeros: { valor: number; rotulo: string }[];
  rodape?: ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, barra.pct));
  const classe =
    "group flex h-full w-full flex-col gap-3 rounded-card border border-border bg-surface p-[var(--pad-card)] text-left shadow-ring transition-[border-color,box-shadow] duration-[var(--motion-duration)] hover:border-accent/50 hover:shadow-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/25";
  const corpo = (
    <>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent">{icone}</span>
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">{sobretitulo}</span>
          <h3 className="mt-0.5 line-clamp-2 break-words text-[15px] font-semibold leading-snug text-text group-hover:text-accent" title={nome}>
            {nome}
          </h3>
        </div>
        {selo}
      </div>

      <div>
        <p className="text-[12px] text-muted">{destaque.rotulo}</p>
        <p className="truncate text-xl font-bold tabular-nums tracking-tight text-text" title={brl(destaque.valor)}>
          {brl(destaque.valor)}
        </p>
      </div>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[12px]">
          <span className="font-medium text-text-2">{barra.rotulo}</span>
          <span className="tabular-nums text-muted">{barra.texto}</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={barra.rotulo}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-[var(--motion-duration)]" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <dl className="space-y-1 text-[12px]">
        {linhas.map((l, i) => (l === "divisor" ? <div key={i} className="my-1 border-t border-border" /> : <Linha key={i} {...l} />))}
      </dl>

      <div className="mt-auto grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-1.5">
        {numeros.map((n) => (
          <Numero key={n.rotulo} valor={n.valor} rotulo={n.rotulo} />
        ))}
      </div>

      {rodape && <div className="border-t border-border pt-2 text-[11.5px] text-muted">{rodape}</div>}
    </>
  );
  return href ? (
    <Link href={href} unstable_dynamicOnHover aria-label={`Abrir ${nome}`} className={classe}>
      {corpo}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={`Abrir ${nome}`} className={classe}>
      {corpo}
    </button>
  );
}

/** O selo do ano no canto do card (o do orçamento). */
export function SeloAno({ children }: { children: ReactNode }) {
  return <span className="shrink-0 rounded-control bg-accent px-2.5 py-1.5 text-[15px] font-bold leading-none tabular-nums tracking-tight text-white shadow-soft">{children}</span>;
}

/** Card do ORÇAMENTO (tela `/painel/orcamento`) sobre o `CartaoFinanceiro`: a dotação atualizada, a execução, a composição e a abrangência. */
export function OrcamentoCard({ orcamento: o, href }: { orcamento: OrcamentoResumo; href: string }) {
  const pct = pctEmpenhado(o);
  return (
    <CartaoFinanceiro
      href={href}
      icone={<IconWallet className="h-5 w-5" />}
      sobretitulo="Orçamento"
      nome={o.nome}
      selo={<SeloAno>{o.ano}</SeloAno>}
      destaque={{ rotulo: "Dotação atualizada", valor: dotacaoAtualizada(o) }}
      barra={{ rotulo: "Execução", pct, texto: `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% empenhado` }}
      linhas={[
        { rotulo: "Inicial", valor: o.valorInicial },
        { rotulo: "Suplementação", valor: o.suplementacao, sinal: "+", tom: "text-[var(--ok)]" },
        ...(o.reducao > 0 ? [{ rotulo: "Redução", valor: o.reducao, sinal: "−" as const, tom: "text-[var(--danger)]" }] : []),
        ...(o.emenda > 0 ? [{ rotulo: "Emenda impositiva", valor: o.emenda }] : []),
        "divisor",
        { rotulo: `Empenhado${o.qtdEmpenho ? ` · ${num(o.qtdEmpenho)} empenhos` : ""}`, valor: o.empenho, tom: "text-text" },
        ...(o.anulacao > 0 ? [{ rotulo: "Anulação de empenho", valor: o.anulacao, sinal: "−" as const, tom: "text-[var(--ok)]" }] : []),
        { rotulo: "Saldo", valor: o.saldo, tom: "text-text" },
      ]}
      numeros={[
        { valor: o.orgaos, rotulo: "órgãos" },
        { valor: o.unidades, rotulo: "unidades" },
        { valor: o.programas, rotulo: "programas" },
        { valor: o.acoes, rotulo: "ações" },
        { valor: o.totalItens, rotulo: "lançamentos" },
      ]}
      rodape={o.atualizadoEm ? `Importado em ${dataBR(o.atualizadoEm)}` : undefined}
    />
  );
}

/** Card "+" — importa um orçamento novo (CUBO); acompanha a altura dos cards da linha. */
export function OrcamentoNovoCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full min-h-[16rem] w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border-2 bg-surface text-muted transition-colors hover:border-accent/50 hover:text-accent focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
    >
      <span className="grid h-10 w-10 place-items-center rounded-control bg-surface-2 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
        <IconPlus className="h-5 w-5" />
      </span>
      <span className="text-sm font-semibold">Importar orçamento</span>
    </button>
  );
}

/**
 * Esqueleto do `OrcamentoCard` — a MESMA moldura e os mesmos blocos: ícone + nome + ano, a dotação atualizada, a barra da
 * execução, a composição e os números da abrangência.
 */
export function EsqueletoOrcamentoCard() {
  return (
    <div className="flex h-full w-full flex-col gap-3 rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-control" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-2.5 w-20 rounded-sm" />
          <Skeleton className="h-4 w-4/5 rounded-sm" />
        </div>
        <Skeleton className="h-8 w-14 shrink-0 rounded-control" />
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-28 rounded-sm" />
        <Skeleton className="h-6 w-2/3 rounded-sm" />
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
      <div className="space-y-1.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-3 w-full rounded-sm" />
        ))}
      </div>
      <div className="mt-auto grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-11 rounded-control" />
        ))}
      </div>
    </div>
  );
}
