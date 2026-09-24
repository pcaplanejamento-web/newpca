/**
 * COMPARATIVO Orçamento × Contratações do PCA, por UNIDADE — núcleo PURO (testável). O planejado
 * vem dos itens do PCA (por unidade requisitante); o orçamento, dos lançamentos do CUBO do mesmo
 * ano, já filtrados pela visão, ligados à unidade do sistema pelos VÍNCULOS (`orcamento_vinculos`).
 * Lançamento sem vínculo cai numa linha "Sem vínculo" (não some do total).
 */

export type FaixaComprometimento = "ok" | "atencao" | "acima" | "sem-orcamento";

/** Faixa da porcentagem planejado ÷ orçamento: < 90% ok · 90–100% atenção · > 100% acima. */
export function faixaComprometimento(planejado: number, orcamento: number): FaixaComprometimento {
  if (!(orcamento > 0)) return "sem-orcamento";
  const p = planejado / orcamento;
  if (p > 1 + 1e-9) return "acima";
  if (p >= 0.9) return "atencao";
  return "ok";
}

export type LinhaComparativo = {
  /** `reparticoes.id`; `null` = sem vínculo / sem unidade. */
  unidadeId: number | null;
  sigla: string;
  nome: string;
  contratacoes: number;
  planejado: number;
  orcamento: number;
  diferenca: number;
  /** planejado ÷ orçamento (0–∞); `null` sem orçamento. */
  percentual: number | null;
  faixa: FaixaComprometimento;
};

export type UnidadeRef = { id: number; sigla: string; nome: string };

export const SEM_VINCULO = "Sem vínculo";

/**
 * A CHAVE da linha do comparativo: a unidade (quando existe no cadastro) ou "sem" (sem vínculo / unidade fora do
 * cadastro). Fonte ÚNICA da agregação e do detalhe da linha (`origemDaLinha`) — os dois nunca divergem.
 */
export function chaveUnidadeComparativo(unidadeId: number | null, unidades: ReadonlySet<number>): string {
  return unidadeId != null && unidades.has(unidadeId) ? `u${unidadeId}` : "sem";
}

/** ORIGEM de uma linha do comparativo: os lançamentos do orçamento e o planejado que formam aqueles números. */
export function origemDaLinha<P extends { unidadeId: number | null }, O extends { unidadeId: number | null }>(
  unidadeId: number | null,
  planejado: P[],
  orc: O[],
  unidades: UnidadeRef[],
): { planejado: P[]; orcamento: O[] } {
  const ids = new Set(unidades.map((u) => u.id));
  const alvo = chaveUnidadeComparativo(unidadeId, ids);
  const casa = (x: { unidadeId: number | null }) => chaveUnidadeComparativo(x.unidadeId, ids) === alvo;
  return { planejado: planejado.filter(casa), orcamento: orc.filter(casa) };
}

/**
 * Monta as linhas do comparativo. `planejado`: por unidade (id ou null) o nº de itens e o Σ; `orc`:
 * cada lançamento com a unidade vinculada (ou null) e o valor.
 */
export function comparativoPorUnidade(
  planejado: { unidadeId: number | null; itens: number; valor: number }[],
  orc: { unidadeId: number | null; valor: number }[],
  unidades: UnidadeRef[],
): LinhaComparativo[] {
  const porId = new Map(unidades.map((u) => [u.id, u]));
  const acc = new Map<string, { unidadeId: number | null; contratacoes: number; planejado: number; orcamento: number }>();
  const ids = new Set(porId.keys());
  const k = (id: number | null) => chaveUnidadeComparativo(id, ids);
  const pega = (id: number | null) => {
    const key = k(id);
    const cur = acc.get(key) ?? { unidadeId: key === "sem" ? null : id, contratacoes: 0, planejado: 0, orcamento: 0 };
    acc.set(key, cur);
    return cur;
  };
  for (const p of planejado) {
    const a = pega(p.unidadeId);
    a.contratacoes += p.itens;
    a.planejado += p.valor;
  }
  for (const o of orc) pega(o.unidadeId).orcamento += o.valor;
  const linhas = [...acc.values()]
    .filter((a) => a.planejado !== 0 || a.orcamento !== 0 || a.contratacoes !== 0)
    .map((a): LinhaComparativo => {
      const u = a.unidadeId != null ? porId.get(a.unidadeId) : undefined;
      return {
        unidadeId: a.unidadeId,
        sigla: u?.sigla ?? SEM_VINCULO,
        nome: u?.nome ?? "Lançamentos/itens sem unidade vinculada",
        contratacoes: a.contratacoes,
        planejado: a.planejado,
        orcamento: a.orcamento,
        diferenca: a.orcamento - a.planejado,
        percentual: a.orcamento > 0 ? a.planejado / a.orcamento : null,
        faixa: faixaComprometimento(a.planejado, a.orcamento),
      };
    });
  // Unidades em ordem alfabética; "Sem vínculo" sempre por último.
  return linhas.sort((a, b) =>
    a.unidadeId == null ? 1 : b.unidadeId == null ? -1 : a.sigla.localeCompare(b.sigla, "pt-BR"),
  );
}

/** Totais do comparativo (KPIs). */
export function totaisComparativo(linhas: LinhaComparativo[]) {
  const orcamento = linhas.reduce((s, l) => s + l.orcamento, 0);
  const planejado = linhas.reduce((s, l) => s + l.planejado, 0);
  return {
    orcamento,
    planejado,
    saldo: orcamento - planejado,
    comprometido: orcamento > 0 ? planejado / orcamento : null,
    acima: linhas.filter((l) => l.faixa === "acima" || (l.faixa === "sem-orcamento" && l.planejado > 0)).length,
  };
}

/** A linha está "acima do orçamento"? (inclui planejado sem orçamento). */
export function linhaAcima(l: LinhaComparativo): boolean {
  return l.faixa === "acima" || (l.faixa === "sem-orcamento" && l.planejado > 0);
}
