import { EsqueletoTabela } from "./DataTableEsqueleto";
import { EsqueletoStatMini } from "./StatMini";

/**
 * ESQUELETO DAS VISÕES DA PADRONIZAÇÃO do Catálogo (Unidades de medida | Classificações) — os 4 `StatMini` e as tabelas
 * (o cadastro e a comparação com os itens). O MESMO no `dynamic` (o código da visão chegando) e na espera dos dados.
 * Arquivo leve, sem "use client".
 */
export function EsqueletoPadronizacao() {
  return (
    <div aria-busy className="space-y-[var(--gap-block)]">
      <div className="grid grid-cols-2 gap-[var(--gap-block)] lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <EsqueletoStatMini key={i} />
        ))}
      </div>
      <EsqueletoTabela linhas={6} colunas={6} />
      <EsqueletoTabela linhas={8} colunas={6} />
    </div>
  );
}
