/**
 * ACRÉSCIMO × SUPRESSÃO de itens (a régua da Lei 14.133) — PURO, sem `getDb`/JSX. Lê o diff de item do histórico
 * (`DiffItemDfd`: os campos já FORMATADOS em pt-BR, "1.234,5" e "R$ 1.234,56") e diz o que a alteração foi:
 * inclusão (item novo), exclusão (item removido), acréscimo (quantidade ou valor total subiu), supressão (desceu)
 * ou sem impacto (só texto: código, descrição, medida).
 */
import type { DiffItemDfd } from "./comparar-protocolo";

export type ClasseAlteracaoItem = "inclusao" | "acrescimo" | "supressao" | "exclusao" | "sem-impacto";

export const ROTULO_CLASSE_ITEM: Record<ClasseAlteracaoItem, string> = {
  inclusao: "Inclusão",
  acrescimo: "Acréscimo",
  supressao: "Supressão",
  exclusao: "Exclusão",
  "sem-impacto": "Sem impacto",
};

export type AlteracaoItemClassificada = {
  classe: ClasseAlteracaoItem;
  /** Quantidade antes → depois (null quando o histórico não registrou). */
  qtdAntes: number | null;
  qtdDepois: number | null;
  /** Valor total antes → depois. */
  valorAntes: number | null;
  valorDepois: number | null;
  /** Diferenças (depois − antes); null sem os dois lados. */
  dQtd: number | null;
  dValor: number | null;
};

/** Número de um texto formatado em pt-BR ("R$ 1.234,56", "1.234,5", "—"). Sem número = null. */
export function numeroFormatado(t: string | null | undefined): number | null {
  if (t == null) return null;
  const s = String(t).replace(/R\$\s*/g, "").replace(/\s/g, "").trim();
  if (!s || s === "—" || s === "-") return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const campo = (it: DiffItemDfd, nome: string) => it.campos.find((c) => c.campo === nome);
const dif = (a: number | null, b: number | null) => (a == null || b == null ? null : Math.round((b - a) * 1e4) / 1e4);

/** A classe de UMA alteração de item. O valor total decide; sem ele, a quantidade. */
export function classificarAlteracaoItem(it: DiffItemDfd): AlteracaoItemClassificada {
  const q = campo(it, "quantidade");
  const v = campo(it, "valorTotal");
  const qtdAntes = numeroFormatado(q?.antes);
  const qtdDepois = numeroFormatado(q?.depois);
  const valorAntes = numeroFormatado(v?.antes);
  const valorDepois = numeroFormatado(v?.depois);
  const dQtd = dif(qtdAntes, qtdDepois);
  const dValor = dif(valorAntes, valorDepois);
  let classe: ClasseAlteracaoItem;
  if (it.tipo === "novo") classe = "inclusao";
  else if (it.tipo === "removido") classe = "exclusao";
  else {
    const d = dValor != null && dValor !== 0 ? dValor : dQtd;
    classe = d == null || d === 0 ? "sem-impacto" : d > 0 ? "acrescimo" : "supressao";
  }
  return { classe, qtdAntes, qtdDepois, valorAntes, valorDepois, dQtd, dValor };
}

export type ResumoAlteracoesItens = {
  inclusao: number;
  acrescimo: number;
  supressao: number;
  exclusao: number;
  semImpacto: number;
  /** Σ dos acréscimos de valor (positivo) e Σ das supressões de valor (positivo = o que saiu). */
  valorAcrescido: number;
  valorSuprimido: number;
};

/** O resumo de várias alterações (de um evento, de um DFD ou de um protocolo). */
export function resumoAlteracoesItens(itens: DiffItemDfd[]): ResumoAlteracoesItens {
  const r: ResumoAlteracoesItens = { inclusao: 0, acrescimo: 0, supressao: 0, exclusao: 0, semImpacto: 0, valorAcrescido: 0, valorSuprimido: 0 };
  for (const it of itens) {
    const c = classificarAlteracaoItem(it);
    if (c.classe === "sem-impacto") r.semImpacto++;
    else r[c.classe]++;
    if (c.classe === "acrescimo" && c.dValor != null && c.dValor > 0) r.valorAcrescido += c.dValor;
    if (c.classe === "supressao" && c.dValor != null && c.dValor < 0) r.valorSuprimido += -c.dValor;
  }
  r.valorAcrescido = Math.round(r.valorAcrescido * 1e4) / 1e4;
  r.valorSuprimido = Math.round(r.valorSuprimido * 1e4) / 1e4;
  return r;
}

/** Há algo de impacto no resumo (para mostrar a linha só quando importa). */
export function temImpacto(r: ResumoAlteracoesItens): boolean {
  return r.inclusao + r.acrescimo + r.supressao + r.exclusao > 0;
}
