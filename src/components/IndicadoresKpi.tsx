"use client";

import type { ReactNode } from "react";
import { KpiStat } from "./KpiStat";
import { MaisIndicadores } from "./MaisIndicadores";

/** Um cartão dos indicadores: o valor, até dois detalhes curtos e a cor. */
export type CartaoKpi = { label: string; value: ReactNode; hint?: string; cor?: string; detalhes?: { rotulo: string; valor: ReactNode }[] };

/** O que vai no canto dos cartões principais (o relógio da atualização e o "Importar agora"). */
export type CantoKpi = { canto?: ReactNode; acaoCanto?: ReactNode };

/**
 * OS INDICADORES PADRÃO das telas de dados (Frotas, Empenhos, Liquidações, Pagamentos): os QUATRO principais à vista e os
 * demais em "Mais indicadores". `canto` vai no 1º cartão (ou nos quatro, com `todos`).
 */
export function IndicadoresKpi({ cartoes, canto, todos = false }: { cartoes: CartaoKpi[]; canto?: CantoKpi; todos?: boolean }) {
  const grade = (cs: CartaoKpi[], principais: boolean) => (
    <div className="grid grid-cols-1 gap-[var(--gap-block)] sm:grid-cols-2 lg:grid-cols-4">
      {cs.map((c, i) => (
        <KpiStat key={c.label} label={c.label} value={c.value} hint={c.hint} cor={c.cor} detalhes={c.detalhes} realce completo {...(principais && canto && (todos || i === 0) ? canto : {})} />
      ))}
    </div>
  );
  const extras = cartoes.slice(4);
  return (
    <>
      {grade(cartoes.slice(0, 4), true)}
      {extras.length > 0 && <MaisIndicadores extras={grade(extras, false)} />}
    </>
  );
}
