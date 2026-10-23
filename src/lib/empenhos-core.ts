/**
 * EMPENHOS da Centi — o núcleo PURO da importação (testado em `tests/empenhos.test.ts`): um registro do portal → a
 * linha do banco, a CHAVE (a MESMA da tabela — ano|órgão gestor|número), a leitura de uma página e a CONFERÊNCIA do
 * lote. As falhas do Dattago que este núcleo evita: a deduplicação com chave diferente da do banco (o lote inteiro era
 * recusado), o registro sem número gravado como "0" (colisão — aqui é RECUSADO e contado) e a importação contada como
 * completa sem bater com o total que a própria Centi informa.
 */
import { lerParametros, montarCorpo, registrosDaResposta } from "./centi-apis-core.ts";
import { parseValorPlanilha } from "./parse-orcamento-comum.ts";

/** Teto de páginas de um lote (proteção: uma API que repete a mesma página nunca prende o lote). */
export const MAX_PAGINAS = 500;

export type LinhaEmpenho = {
  chave: string;
  ano: number;
  srcId: number | null;
  numero: string;
  data: string | null;
  orgaoGestor: string;
  unidadeOrcamentaria: string | null;
  fornecedor: string | null;
  cpfCnpj: string | null;
  modalidade: string | null;
  licitacao: string | null;
  funcao: string | null;
  subfuncao: string | null;
  programa: string | null;
  acao: string | null;
  elemento: string | null;
  subelemento: string | null;
  fonte: string | null;
  valorEmpenhado: number;
  valorAnulado: number;
  valorLiquidado: number;
  valorPago: number;
  saldoPagar: number;
  historico: string | null;
};

function texto(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).replace(/\s+/g, " ").trim();
  return t ? t : null;
}

/** Valor em R$: número como veio; texto em pt-BR ou en-US. Vazio/inválido = 0. */
export function valor(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  return parseValorPlanilha(v) ?? 0;
}

/** Data da Centi (dd/mm/aaaa, com ou sem hora, ou ISO) → AAAA-MM-DD; inválida = null. */
export function dataIso(v: unknown): string | null {
  const t = texto(v);
  if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const [a, m, d] = iso ? [iso[1], iso[2], iso[3]] : br ? [br[3], br[2].padStart(2, "0"), br[1].padStart(2, "0")] : [];
  if (!a) return null;
  const dt = new Date(`${a}-${m}-${d}T12:00:00Z`);
  return Number.isNaN(dt.getTime()) || dt.getUTCDate() !== Number(d) ? null : `${a}-${m}-${d}`;
}

/** A CHAVE do empenho — a mesma da tabela (única): ano|órgão gestor|número. */
export function chaveEmpenho(ano: number, orgaoGestor: string, numero: string): string {
  return `${ano}|${orgaoGestor}|${numero}`;
}

/** Um registro do portal → a linha (ou o motivo da recusa: sem número não entra — nunca vira "0"). */
export function linhaEmpenho(item: Record<string, unknown>, ano: number): { linha: LinhaEmpenho } | { recusado: string } {
  const numero = texto(item.Numero);
  if (!numero) return { recusado: "sem número" };
  const orgaoGestor = texto(item.OrgaoGestor) ?? "";
  const id = Number(item.Id);
  return {
    linha: {
      chave: chaveEmpenho(ano, orgaoGestor, numero),
      ano,
      srcId: Number.isInteger(id) && id > 0 ? id : null,
      numero,
      data: dataIso(item.Data),
      orgaoGestor,
      unidadeOrcamentaria: texto(item.UnidadeOrcamentaria),
      fornecedor: texto(item.Fornecedor),
      cpfCnpj: texto(item.CpfCnpjCredor),
      modalidade: texto(item.LicitacaoModalidade),
      licitacao: texto(item.IdLicitacaoDispensaAdesao),
      funcao: texto(item.Funcao),
      subfuncao: texto(item.SubFuncao),
      programa: texto(item.Programa),
      acao: texto(item.Acao),
      elemento: texto(item.Elemento),
      subelemento: texto(item.SubElemento),
      fonte: texto(item.FonteRecurso),
      valorEmpenhado: valor(item.ValorEmpenhado),
      valorAnulado: valor(item.ValorAnulacao),
      valorLiquidado: valor(item.ValorLiquidado),
      valorPago: valor(item.ValorPago),
      saldoPagar: valor(item.SaldoPagar),
      historico: texto(item.Historico),
    },
  };
}

export type PaginaLida = {
  /** Quantos registros vieram na página (aceitos + recusados). */
  recebidos: number;
  linhas: LinhaEmpenho[];
  recusados: number;
  /** Repetidos DENTRO da página (a mesma chave). */
  repetidos: number;
  total: number | null;
};

/** Lê uma página da resposta (JSON). Lança `Error` se a resposta não for uma lista de registros. */
export function lerPaginaEmpenhos(textoResposta: string, ano: number): PaginaLida {
  let j: unknown;
  try {
    j = JSON.parse(textoResposta);
  } catch {
    throw new Error("A resposta da Centi não é JSON.");
  }
  const regs = registrosDaResposta(j);
  if (!regs) throw new Error("A resposta da Centi não traz uma lista de registros.");
  const vistas = new Set<string>();
  const linhas: LinhaEmpenho[] = [];
  let recusados = 0;
  let repetidos = 0;
  for (const r of regs) {
    const l = linhaEmpenho(r, ano);
    if ("recusado" in l) {
      recusados++;
      continue;
    }
    if (vistas.has(l.linha.chave)) {
      repetidos++;
      continue;
    }
    vistas.add(l.linha.chave);
    linhas.push(l.linha);
  }
  const bruto = regs[0]?.TotalRegistros ?? (j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>).TotalRegistros : undefined);
  const total = bruto != null && Number.isFinite(Number(bruto)) ? Number(bruto) : null;
  return { recebidos: regs.length, linhas, recusados, repetidos, total };
}

/** O corpo do pedido de uma página: os parâmetros com o ano e, a partir da 2ª página, a `pagina` (a 1ª vai sem ela —
 * como a Centi espera). Os parâmetros com o marcador {pagina} recebem o número em todas. */
export function corpoDaPagina(parametros: string, ano: number, pagina: number): unknown {
  const p = lerParametros(parametros);
  if (!p.ok) throw new Error(p.motivo);
  const corpo = montarCorpo(p.valor, { ano, pagina }) as Record<string, unknown>;
  if (pagina > 1 && !parametros.includes("{pagina}")) return { ...corpo, pagina };
  return corpo;
}

export type SituacaoLote = { recebidos: number; unicos: number; recusados: number; totalInformado: number | null; paginas: number };

/** Ler mais uma página? Para quando chegou ao total informado, quando a página veio vazia ou sem nada novo, ou no teto. */
export function continuarLendo(s: SituacaoLote, ultima: { recebidos: number; novos: number }): boolean {
  if (ultima.recebidos === 0 || ultima.novos === 0) return false;
  if (s.paginas >= MAX_PAGINAS) return false;
  return s.totalInformado == null || s.recebidos < s.totalInformado;
}

/**
 * A CONFERÊNCIA do lote: só é completo quando os registros DISTINTOS (+ os recusados, que a Centi também conta) alcançam
 * o total que a Centi informou. Contar os recebidos não basta: uma página repetida faria "bater" com registros faltando.
 */
export function conferirLote(s: SituacaoLote): { completo: true } | { completo: false; motivo: string } {
  if (s.totalInformado == null) return { completo: false, motivo: "A Centi não informou o total de registros — não dá para conferir." };
  const contados = s.unicos + s.recusados;
  if (contados >= s.totalInformado) return { completo: true };
  const repetidos = s.recebidos - contados;
  return {
    completo: false,
    motivo: `Faltam registros: ${contados} distintos de ${s.totalInformado} informados pela Centi${repetidos > 0 ? ` (${repetidos} vieram repetidos)` : ""}${s.paginas >= MAX_PAGINAS ? ` — parou no teto de ${MAX_PAGINAS} páginas` : ""}.`,
  };
}

export type EstadoLote = "lendo" | "promovido" | "parcial" | "falhou" | "cancelado";

export const ROTULO_ESTADO_LOTE: Record<EstadoLote, { rotulo: string; tom: "blue" | "emerald" | "amber" | "red" | "slate" }> = {
  lendo: { rotulo: "Lendo", tom: "blue" },
  promovido: { rotulo: "Importado", tom: "emerald" },
  parcial: { rotulo: "Parcial", tom: "amber" },
  falhou: { rotulo: "Falhou", tom: "red" },
  cancelado: { rotulo: "Cancelado", tom: "slate" },
};

/** Sem atividade há mais que isto, o lote "lendo" é considerado abandonado (outro pode começar). */
export const MINUTOS_LOTE_PARADO = 30;

/** Os anos que a API mantém (o atual e os anteriores, conforme o cadastro). */
export function anosDaApi(anoAtual: number, anos: number): number[] {
  return Array.from({ length: Math.max(1, anos) }, (_, i) => anoAtual - i);
}

export type LoteCenti = {
  id: number;
  ano: number;
  estado: EstadoLote;
  paginas: number;
  recebidos: number;
  unicos: number;
  recusados: number;
  totalInformado: number | null;
  inseridos: number | null;
  atualizados: number | null;
  removidos: number | null;
  mensagem: string | null;
  iniciadoPor: string;
  iniciadoEm: string;
  vistoEm: string;
  concluidoEm: string | null;
};
