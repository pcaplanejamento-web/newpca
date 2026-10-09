"use client";

import { SeletorMultiplo } from "./SeletorMultiplo";

/** Uma opção do filtro: a chave (o que o filtro guarda), o texto e quantos itens. */
export type OpcaoFiltroDash = { chave: string; rotulo: string; count: number };
export type CampoFiltroDash = { dim: string; rotulo: string; opcoes: OpcaoFiltroDash[]; selecionados: string[] };

/**
 * FILTROS DO DASHBOARD — uma linha de menus suspensos de seleção MÚLTIPLA (busca, marcar todos, limpar), um por
 * dimensão dos gráficos. As opções chegam CONECTADAS (só o que existe com os demais filtros, com a contagem de itens);
 * nenhum marcado = sem filtro. Os mesmos filtros que o toque nos gráficos liga — os dois caminhos ficam em sincronia.
 */
export function FiltrosDashboard({ campos, onMudar }: { campos: CampoFiltroDash[]; onMudar: (dim: string, chaves: string[]) => void }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
      {campos.map((c) => {
        const porRotulo = new Map(c.opcoes.map((o) => [o.rotulo, o.chave]));
        const rotuloDe = new Map(c.opcoes.map((o) => [o.chave, o.rotulo]));
        return (
          <SeletorMultiplo
            key={c.dim}
            suspenso
            rotulo={c.rotulo}
            textoVazio="Todos"
            opcoes={c.opcoes.map((o) => ({ valor: o.rotulo, contagem: o.count }))}
            selecionados={c.selecionados.map((k) => rotuloDe.get(k) ?? k)}
            onChange={(vs) => onMudar(c.dim, vs.map((v) => porRotulo.get(v) ?? v))}
          />
        );
      })}
    </div>
  );
}
