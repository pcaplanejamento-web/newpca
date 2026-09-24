/**
 * ORIGEM DOS DADOS dos gráficos do Dashboard — núcleo PURO (testado). Um clique numa fatia/barra vira um
 * RECORTE, e `itensDoRecorte` devolve os itens que formam aquele número com a MESMA chave de agrupamento
 * dos gráficos (`fatias` do `pca-core` e as consultas de `queries.ts`: valor vazio = "—").
 */

export type RecorteDash =
  | { dim: "classificacao"; labels: string[] }
  | { dim: "unidadeMedida"; labels: string[] }
  | { dim: "mes"; ano: number; mes: number }
  | { dim: "item"; id: number };

/** O mínimo de um item p/ o recorte (o `ItemRow` do dashboard). */
export type ItemRecortavel = {
  id: number;
  classificacao: string | null;
  unidadeMedida: string | null;
  ano?: number | null;
  mes?: number | null;
  /** Previsão ANUAL (fonte protocolo): o cronograma soma 1/12 do item em CADA mês do ano. */
  anual?: boolean;
};

const chave = (v: string | null) => v || "—";

/** Itens do recorte + quantos entram por serem ANUAIS (no recorte de mês — 1/12 do valor em cada mês). */
export function itensDoRecorte<T extends ItemRecortavel>(itens: T[], r: RecorteDash): { itens: T[]; anuais: number } {
  if (r.dim === "item") return { itens: itens.filter((i) => i.id === r.id), anuais: 0 };
  if (r.dim === "mes") {
    let anuais = 0;
    const lista = itens.filter((i) => {
      if (i.ano !== r.ano) return false;
      if (i.anual) {
        anuais++;
        return true;
      }
      return i.mes === r.mes;
    });
    return { itens: lista, anuais };
  }
  const set = new Set(r.labels);
  const campo = r.dim === "classificacao" ? (i: T) => i.classificacao : (i: T) => i.unidadeMedida;
  return { itens: itens.filter((i) => set.has(chave(campo(i)))), anuais: 0 };
}
