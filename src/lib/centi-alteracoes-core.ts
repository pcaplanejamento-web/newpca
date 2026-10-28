import type { DiffCampo } from "./comparar-protocolo.ts";
import { brl, dataBR } from "./format.ts";

/**
 * O HISTÓRICO DAS ALTERAÇÕES da Centi — a leitura PURA (testada): cada linha de `centi_alteracoes` vira o que a tela mostra
 * (a ação, quando, a importação e cada campo antes → depois, com o rótulo e o formato do campo).
 */
export type TipoAlteracao = "empenho" | "liquidacao" | "pagamento";
export type AcaoAlteracao = "alterado" | "ausente" | "removido" | "restaurado";

export const ROTULO_ACAO_ALTERACAO: Record<AcaoAlteracao, string> = {
  alterado: "Alterado na Centi",
  ausente: "Ausente na importação",
  removido: "Removido na Centi",
  restaurado: "Voltou na Centi",
};

const ROTULOS: Record<string, string> = {
  ano: "Ano",
  srcId: "Id na Centi",
  numero: "Número",
  data: "Data",
  orgaoGestor: "Órgão gestor",
  unidadeOrcamentaria: "Unidade orçamentária",
  fornecedor: "Fornecedor",
  cpfCnpj: "CPF/CNPJ",
  modalidade: "Modalidade",
  licitacao: "Licitação",
  funcao: "Função",
  subfuncao: "Subfunção",
  programa: "Programa",
  acao: "Ação",
  elemento: "Elemento",
  subelemento: "Subelemento",
  fonte: "Fonte de recurso",
  valorEmpenhado: "Valor empenhado",
  valorAnulado: "Valor anulado",
  valorLiquidado: "Valor liquidado",
  valorPago: "Valor pago",
  saldoPagar: "Saldo a pagar",
  historico: "Histórico",
  numeroEmpenho: "Nº do empenho",
  orgao: "Órgão (Centi)",
  credor: "Credor",
  valor: "Valor",
  valorLiquido: "Valor líquido",
  valorRetencao: "Retenção",
  saldo: "Saldo",
  anulado: "Anulado",
  motivoAnulacao: "Motivo da anulação",
  idOrgaoCenti: "ID do órgão na Centi",
};

const DINHEIRO = new Set(["valorEmpenhado", "valorAnulado", "valorLiquidado", "valorPago", "saldoPagar", "valor", "valorLiquido", "valorRetencao", "saldo"]);

/** O valor de um campo como a tela mostra (vazio = "—"). */
export function valorDoCampo(campo: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (DINHEIRO.has(campo) && typeof v === "number") return brl(v);
  if (campo === "data" && typeof v === "string") return dataBR(v) || v;
  if (campo === "anulado") return Number(v) ? "Sim" : "Não";
  return String(v);
}

/** Os campos que mudaram (o JSON gravado — `[{c, a, d}]`), na ordem; JSON inválido = nenhum. */
export function camposDaAlteracao(json: string | null): DiffCampo[] {
  if (!json) return [];
  let lista: unknown;
  try {
    lista = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(lista)) return [];
  const out: DiffCampo[] = [];
  for (const it of lista) {
    if (!it || typeof it !== "object") continue;
    const { c, a, d } = it as { c?: unknown; a?: unknown; d?: unknown };
    if (typeof c !== "string") continue;
    out.push({ campo: c, rotulo: ROTULOS[c] ?? c, antes: valorDoCampo(c, a), depois: valorDoCampo(c, d) });
  }
  return out;
}

export type AlteracaoCenti = { id: number; acao: AcaoAlteracao; rotulo: string; em: string; loteId: number | null; campos: DiffCampo[] };

const ACOES = new Set<string>(["alterado", "ausente", "removido", "restaurado"]);

/** As linhas gravadas → o que a tela mostra (ação desconhecida sai). */
export function alteracoesDoRegistro(linhas: readonly { id: number; acao: string; em: string; loteId: number | null; campos: string | null }[]): AlteracaoCenti[] {
  return linhas
    .filter((l) => ACOES.has(l.acao))
    .map((l) => {
      const acao = l.acao as AcaoAlteracao;
      return { id: l.id, acao, rotulo: ROTULO_ACAO_ALTERACAO[acao], em: l.em, loteId: l.loteId, campos: camposDaAlteracao(l.campos) };
    });
}

/** Dias que o histórico das alterações fica guardado (a limpeza do cron). */
export const DIAS_ALTERACOES = 365;
