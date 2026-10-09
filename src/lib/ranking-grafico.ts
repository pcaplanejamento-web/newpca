/**
 * RANKING de uma série de gráfico (o EXPLORADOR — expandir um gráfico do Dashboard): ordena pelo valor, dá a
 * PARTICIPAÇÃO no total e a POSIÇÃO ("3º de 12") e conta as fatias pequenas. Núcleo PURO (testado).
 */

export type PontoSerie = { chave: string; rotulo: string; valor: number; count?: number };

export type PosicaoSerie = PontoSerie & {
  /** Fração do total (0–1); total zero ⇒ 0. */
  participacao: number;
  /** 1 = a maior. Valores iguais dividem a posição. */
  posicao: number;
};

/** Abaixo disto a fatia é "pequena" (o selo do explorador). */
export const LIMITE_PEQUENA = 0.02;

export function rankingSerie(serie: PontoSerie[]): PosicaoSerie[] {
  const total = serie.reduce((s, p) => s + Math.max(0, p.valor), 0);
  const ordem = serie
    .slice()
    .sort((a, b) => b.valor - a.valor || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  let posicao = 0;
  let anterior: number | null = null;
  return ordem.map((p, i) => {
    if (anterior !== p.valor) posicao = i + 1;
    anterior = p.valor;
    return { ...p, participacao: total > 0 ? Math.max(0, p.valor) / total : 0, posicao };
  });
}

/** Quantas fatias ficam abaixo do limite (com valor > 0). */
export const fatiasPequenas = (r: PosicaoSerie[], limite = LIMITE_PEQUENA): number =>
  r.filter((p) => p.valor > 0 && p.participacao < limite).length;

/** "12,5%" / "< 0,1%" — a participação para ler. */
export function textoParticipacao(f: number): string {
  if (!(f > 0)) return "0%";
  if (f < 0.001) return "< 0,1%";
  return `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
