import Link from "next/link";
import { brl, dataBR, num } from "@/lib/format";
import type { OrcamentoResumo } from "@/lib/orcamento";
import { dotacaoAtualizada, pctEmpenhado } from "@/lib/orcamento-indicadores";
import { IconPlus, IconWallet } from "./icons";

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

/**
 * Card do ORÇAMENTO (tela `/painel/orcamento`) — só INFORMAÇÃO: o nome inteiro; o ano em destaque no canto; a dotação ATUALIZADA
 * com o valor COMPLETO; a barra da execução (empenhado × saldo); a COMPOSIÇÃO da dotação (inicial +
 * suplementação − anulação, e a emenda impositiva) e a execução com os valores completos; a abrangência (órgãos,
 * unidades, programas, ações, lançamentos) e a data da importação. Nenhum texto é cortado: o que não cabe, quebra.
 */
export function OrcamentoCard({ orcamento: o, href }: { orcamento: OrcamentoResumo; href: string }) {
  const atualizada = dotacaoAtualizada(o);
  const pct = pctEmpenhado(o);
  const pctTexto = `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return (
    <Link
      href={href}
      aria-label={`Abrir ${o.nome}`}
      className="group flex h-full w-full flex-col gap-3 rounded-card border border-border bg-surface p-[var(--pad-card)] text-left shadow-ring transition-[border-color,box-shadow] duration-[var(--motion-duration)] hover:border-accent/50 hover:shadow-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/25"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent">
          <IconWallet className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">Orçamento</span>
          <h3 className="mt-0.5 break-words text-[15px] font-semibold leading-snug text-text group-hover:text-accent">{o.nome}</h3>
        </div>
        <span className="shrink-0 rounded-control bg-accent px-2.5 py-1.5 text-[15px] font-bold leading-none tabular-nums tracking-tight text-white shadow-soft">
          {o.ano}
        </span>
      </div>

      <div>
        <p className="text-[12px] text-muted">Dotação atualizada</p>
        <p className="break-words text-xl font-bold tabular-nums tracking-tight text-text">{brl(atualizada)}</p>
      </div>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[12px]">
          <span className="font-medium text-text-2">Execução</span>
          <span className="tabular-nums text-muted">{pctTexto} empenhado</span>
        </div>
        <div
          className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Empenhado"
        >
          <div className="h-full rounded-full bg-accent transition-[width] duration-[var(--motion-duration)]" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <dl className="space-y-1 text-[12px]">
        <Linha rotulo="Inicial" valor={o.valorInicial} />
        <Linha rotulo="Suplementação" valor={o.suplementacao} sinal="+" tom="text-[var(--ok)]" />
        <Linha rotulo="Anulação" valor={o.anulacao} sinal="−" tom="text-[var(--danger)]" />
        {o.emenda > 0 && <Linha rotulo="Emenda impositiva" valor={o.emenda} />}
        <div className="my-1 border-t border-border" />
        <Linha rotulo={`Empenhado (${pctTexto})`} valor={o.empenho} tom="text-text" />
        <Linha rotulo="Saldo" valor={o.saldo} tom="text-text" />
      </dl>

      <div className="mt-auto grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-1.5">
        <Numero valor={o.orgaos} rotulo="órgãos" />
        <Numero valor={o.unidades} rotulo="unidades" />
        <Numero valor={o.programas} rotulo="programas" />
        <Numero valor={o.acoes} rotulo="ações" />
        <Numero valor={o.totalItens} rotulo="lançamentos" />
      </div>

      {o.atualizadoEm && <p className="border-t border-border pt-2 text-[11.5px] text-muted">Importado em {dataBR(o.atualizadoEm)}</p>}
    </Link>
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
