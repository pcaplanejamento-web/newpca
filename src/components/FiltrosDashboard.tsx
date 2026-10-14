"use client";

import type { ReactNode } from "react";
import { SeletorMultiplo } from "./SeletorMultiplo";

/** Uma opção do filtro: a chave (o que o filtro guarda), o texto e quantos itens. */
export type OpcaoFiltroDash = { chave: string; rotulo: string; count: number; detalhe?: string };
export type CampoFiltroDash = { dim: string; rotulo: string; opcoes: OpcaoFiltroDash[]; selecionados: string[] };

/**
 * FILTROS DO DASHBOARD — uma linha de menus suspensos de seleção MÚLTIPLA (busca, marcar todos, limpar), um por
 * dimensão dos gráficos. As opções chegam CONECTADAS (só o que existe com os demais filtros, com a contagem de itens);
 * nenhum marcado = sem filtro. Os mesmos filtros que o toque nos gráficos liga — os dois caminhos ficam em sincronia.
 */
export function FiltrosDashboard({
  campos,
  onMudar,
  fim,
}: {
  campos: CampoFiltroDash[];
  onMudar: (dim: string, chaves: string[]) => void;
  /** Ao fim da MESMA linha (ex.: a ajuda e o PDF). */
  fim?: ReactNode;
}) {
  // UMA linha no desktop (cada filtro divide o espaço); no celular quebra, com o `fim` sempre junto.
  return (
    <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
      {campos.map((c) => {
        const porRotulo = new Map(c.opcoes.map((o) => [o.rotulo, o.chave]));
        const rotuloDe = new Map(c.opcoes.map((o) => [o.chave, o.rotulo]));
        return (
          <div key={c.dim} className="min-w-0 flex-1 basis-44">
          <SeletorMultiplo
            suspenso
            rotulo={c.rotulo}
            textoVazio="Todos"
            opcoes={c.opcoes.map((o) => ({ valor: o.rotulo, contagem: o.count, detalhe: o.detalhe }))}
            selecionados={c.selecionados.map((k) => rotuloDe.get(k) ?? k)}
            onChange={(vs) => onMudar(c.dim, vs.map((v) => porRotulo.get(v) ?? v))}
          />
          </div>
        );
      })}
      {fim && <div className="flex shrink-0 items-center gap-1.5">{fim}</div>}
    </div>
  );
}
