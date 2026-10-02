/**
 * COMPARATIVO Orçamento × Contratações do PCA, por UNIDADE — núcleo PURO (testável). O planejado
 * vem dos itens do PCA (por unidade requisitante); o orçamento, dos lançamentos do CUBO do mesmo
 * ano, já filtrados pela visão, ligados à unidade do sistema pelos VÍNCULOS (`orcamento_vinculos`).
 * Lançamento sem vínculo cai numa linha "Sem vínculo" (não some do total).
 *
 * A UNIDADE é o MICRO: recebe os DFDs e o orçamento. O ÓRGÃO é a SOMA das unidades dele (`comparativoPorOrgao`). A linha da
 * unidade é pelo ID — duas unidades com a MESMA sigla (outro órgão, a unidade própria de um órgão) são linhas distintas,
 * identificadas pelo órgão; `siglasDivididas` aponta quando o planejado de uma e o orçamento da outra se separaram.
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
  /** O órgão da unidade (`null` = unidade sem órgão / linha "Sem vínculo"). */
  orgaoId: number | null;
  orgaoSigla: string | null;
  oculta: boolean;
  contratacoes: number;
  planejado: number;
  orcamento: number;
  diferenca: number;
  /** planejado ÷ orçamento (0–∞); `null` sem orçamento. */
  percentual: number | null;
  faixa: FaixaComprometimento;
};

export type UnidadeRef = {
  id: number;
  sigla: string;
  nome: string;
  orgaoId?: number | null;
  /** Sigla (ou nome) do órgão da unidade. */
  orgaoSigla?: string | null;
  oculta?: boolean;
};
export type OrgaoRef = { id: number; sigla: string; nome: string };
export const SEM_ORGAO = "Sem órgão";

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
        orgaoId: u?.orgaoId ?? null,
        orgaoSigla: u?.orgaoSigla ?? null,
        oculta: u?.oculta === true,
        contratacoes: a.contratacoes,
        planejado: a.planejado,
        orcamento: a.orcamento,
        diferenca: a.orcamento - a.planejado,
        percentual: a.orcamento > 0 ? a.planejado / a.orcamento : null,
        faixa: faixaComprometimento(a.planejado, a.orcamento),
      };
    });
  // Unidades em ordem alfabética (mesma sigla: pelo órgão); "Sem vínculo" sempre por último.
  return linhas.sort((a, b) =>
    a.unidadeId == null
      ? 1
      : b.unidadeId == null
        ? -1
        : a.sigla.localeCompare(b.sigla, "pt-BR") || (a.orgaoSigla ?? "").localeCompare(b.orgaoSigla ?? "", "pt-BR"),
  );
}

/** Uma linha do comparativo por ÓRGÃO (a soma das unidades). `orgaoId` null + `unidadeId` null = "Sem vínculo". */
export type LinhaOrgao = Omit<LinhaComparativo, "unidadeId" | "oculta"> & {
  /** `"sem"` = sem vínculo; `"o<id>"` = órgão; `"x"` = unidades sem órgão. */
  chave: string;
  unidades: number;
};

/** A chave do ÓRGÃO de uma linha de unidade — fonte única da agregação e da origem. */
export function chaveOrgaoDaLinha(l: Pick<LinhaComparativo, "unidadeId" | "orgaoId">): string {
  if (l.unidadeId == null) return "sem";
  return l.orgaoId != null ? `o${l.orgaoId}` : "x";
}

/** O ÓRGÃO = a SOMA das unidades dele (contratações, planejado, orçamento); a % e a faixa recalculadas sobre a soma. */
export function comparativoPorOrgao(linhas: LinhaComparativo[], orgaos: OrgaoRef[]): LinhaOrgao[] {
  const porId = new Map(orgaos.map((o) => [o.id, o]));
  const acc = new Map<string, LinhaOrgao>();
  for (const l of linhas) {
    const chave = chaveOrgaoDaLinha(l);
    let a = acc.get(chave);
    if (!a) {
      const o = l.orgaoId != null ? porId.get(l.orgaoId) : undefined;
      a = {
        chave,
        orgaoId: chave.startsWith("o") ? l.orgaoId : null,
        sigla: chave === "sem" ? SEM_VINCULO : chave === "x" ? SEM_ORGAO : (o?.sigla || l.orgaoSigla || `Órgão ${l.orgaoId}`),
        nome: chave === "sem" ? l.nome : chave === "x" ? "Unidades sem órgão no cadastro" : (o?.nome ?? ""),
        orgaoSigla: null,
        unidades: 0,
        contratacoes: 0,
        planejado: 0,
        orcamento: 0,
        diferenca: 0,
        percentual: null,
        faixa: "sem-orcamento",
      };
      acc.set(chave, a);
    }
    if (chave !== "sem") a.unidades += 1;
    a.contratacoes += l.contratacoes;
    a.planejado += l.planejado;
    a.orcamento += l.orcamento;
  }
  const out = [...acc.values()].map((a) => ({
    ...a,
    diferenca: a.orcamento - a.planejado,
    percentual: a.orcamento > 0 ? a.planejado / a.orcamento : null,
    faixa: faixaComprometimento(a.planejado, a.orcamento),
  }));
  const peso = (c: string) => (c === "sem" ? 2 : c === "x" ? 1 : 0);
  return out.sort((a, b) => peso(a.chave) - peso(b.chave) || a.sigla.localeCompare(b.sigla, "pt-BR"));
}

/** ORIGEM de uma linha de ÓRGÃO: os lançamentos e o planejado de TODAS as unidades dele (a soma = a linha). */
export function origemDoOrgao<P extends { unidadeId: number | null }, O extends { unidadeId: number | null }>(
  chave: string,
  planejado: P[],
  orc: O[],
  unidades: UnidadeRef[],
): { planejado: P[]; orcamento: O[] } {
  const ids = new Set(unidades.map((u) => u.id));
  const orgaoDe = new Map(unidades.map((u) => [u.id, u.orgaoId ?? null]));
  const casa = (x: { unidadeId: number | null }) => {
    const id = x.unidadeId != null && ids.has(x.unidadeId) ? x.unidadeId : null;
    return chaveOrgaoDaLinha({ unidadeId: id, orgaoId: id == null ? null : (orgaoDe.get(id) ?? null) }) === chave;
  };
  return { planejado: planejado.filter(casa), orcamento: orc.filter(casa) };
}

/**
 * SIGLAS DIVIDIDAS: a mesma sigla em 2+ unidades em que o PLANEJADO está numa e o ORÇAMENTO noutra — quase sempre o vínculo
 * do CUBO apontado para a unidade errada. Devolve, por sigla, as unidades só com planejado e as só com orçamento.
 */
export function siglasDivididas(
  linhas: LinhaComparativo[],
): { sigla: string; comPlanejado: LinhaComparativo[]; comOrcamento: LinhaComparativo[] }[] {
  const porSigla = new Map<string, LinhaComparativo[]>();
  for (const l of linhas) {
    if (l.unidadeId == null) continue;
    const k = l.sigla.trim().toUpperCase();
    porSigla.set(k, [...(porSigla.get(k) ?? []), l]);
  }
  const out: { sigla: string; comPlanejado: LinhaComparativo[]; comOrcamento: LinhaComparativo[] }[] = [];
  for (const ls of porSigla.values()) {
    if (ls.length < 2) continue;
    const comPlanejado = ls.filter((l) => l.planejado !== 0 && l.orcamento === 0);
    const comOrcamento = ls.filter((l) => l.orcamento !== 0 && l.planejado === 0);
    if (comPlanejado.length > 0 && comOrcamento.length > 0) out.push({ sigla: ls[0].sigla, comPlanejado, comOrcamento });
  }
  return out;
}

/** "FMMA — Fundo… (órgão X)" — a unidade identificada sem ambiguidade. */
export function rotuloUnidadeComparativo(l: Pick<LinhaComparativo, "sigla" | "nome" | "orgaoSigla" | "unidadeId">): string {
  if (l.unidadeId == null) return l.sigla;
  return `${l.sigla} — ${l.nome}${l.orgaoSigla ? ` (${l.orgaoSigla})` : ""}`;
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
export function linhaAcima(l: Pick<LinhaComparativo, "faixa" | "planejado">): boolean {
  return l.faixa === "acima" || (l.faixa === "sem-orcamento" && l.planejado > 0);
}
