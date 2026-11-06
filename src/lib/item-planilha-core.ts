import { totalDoItem } from "./parse-dfd-comum.ts";
import { limparTexto, normPrioridade, normUnidadeMedida, parseDataDesejada, previsaoGenericaDe } from "./normalize.ts";

/**
 * EDIÇÃO de UM item importado por PLANILHA (aba Importação do PCA) — núcleo PURO e testado. A MESMA régua da importação
 * (`normalizarLinha`): texto limpo, medida canônica, data "MM/AAAA" ou previsão genérica, prioridade ALTA/MÉDIA/BAIXA. O
 * SEQUENCIAL (sagrado), a unidade (a planilha) e a classificação/domínio (calculados pelo Catálogo) não se editam.
 */

/** Limites dos textos (a mesma régua do DFD: descrição longa nunca é cortada pela leitura). */
export const LIMITES_ITEM_PLANILHA = { codigo: 40, descricao: 20_000, medida: 100 } as const;

/** Os períodos da previsão GENÉRICA aceitos (os da importação). */
export const PERIODOS_PREVISAO_PLANILHA = ["ANUAL", "SEMESTRAL", "QUADRIMESTRAL", "TRIMESTRAL"] as const;

/** O item como está gravado (só os campos editáveis + os da previsão). */
export type ItemPlanilhaGravado = {
  idProduto: string | null;
  nomeProduto: string | null;
  unidadeMedida: string | null;
  quantidade: number | null;
  valorReferencia: number | null;
  valorTotal: number | null;
  dataDesejada: string | null;
  previsaoGenerica: string | null;
  prioridade: string | null;
};

/** O que a tela manda (só o que mudou). `previsao` = "MM/AAAA" | período genérico | null. */
export type PedidoItemPlanilha = {
  idProduto?: string | null;
  nomeProduto?: string | null;
  unidadeMedida?: string | null;
  quantidade?: number | null;
  valorReferencia?: number | null;
  valorTotal?: number | null;
  previsao?: string | null;
  prioridade?: string | null;
};

/** A previsão como a tela a mostra: o período genérico, senão "MM/AAAA" da data desejada. */
export function previsaoDoItem(i: { dataDesejada: string | null; previsaoGenerica: string | null }): string | null {
  if (i.previsaoGenerica) return i.previsaoGenerica;
  const m = (i.dataDesejada ?? "").match(/^(\d{4})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : null;
}

/** As opções da PREVISÃO: os 12 meses do ano do PCA + os períodos genéricos (+ a atual, se estiver fora). */
export function opcoesPrevisao(ano: number | null, atual: string | null = null): string[] {
  const meses = ano ? Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, "0")}/${ano}`) : [];
  const lista = [...meses, ...PERIODOS_PREVISAO_PLANILHA];
  return atual && !lista.includes(atual) ? [atual, ...lista] : lista;
}

const texto = (v: string | null | undefined, max: number): string | null => {
  const s = limparTexto(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};
const numero = (v: number | null | undefined): number | null => (v != null && Number.isFinite(v) && v >= 0 ? v : null);

/** Os campos gravados que uma edição pode mudar. */
export type SetItemPlanilha = Partial<
  ItemPlanilhaGravado & { unidadeMedidaNorm: string | null; mesDesejado: number | null; anoDesejado: number | null; classificadoVersao: null }
>;

export type PlanoItemPlanilha = {
  /** Só o que mudou de fato (vazio = nada a gravar). */
  set: SetItemPlanilha;
  /** Código, descrição ou medida mudaram: a classificação/domínio do Catálogo são recalculados. */
  reclassificar: boolean;
  /** Antes → depois, legível (auditoria). */
  antes: Record<string, unknown>;
  depois: Record<string, unknown>;
  /** O pedido inválido (nada é gravado). */
  erro: string | null;
};

const ROTULOS: Record<string, string> = {
  idProduto: "código",
  nomeProduto: "descrição",
  unidadeMedida: "medida",
  quantidade: "quantidade",
  valorReferencia: "valor unitário",
  valorTotal: "valor total",
  previsao: "previsão",
  prioridade: "prioridade",
};
export const rotuloCampoPlanilha = (c: string) => ROTULOS[c] ?? c;

/** O PLANO da edição: normaliza cada campo pedido pela régua da importação e devolve só o que mudou. */
export function planoEdicaoItemPlanilha(atual: ItemPlanilhaGravado, pedido: PedidoItemPlanilha): PlanoItemPlanilha {
  const set: SetItemPlanilha = {};
  const antes: Record<string, unknown> = {};
  const depois: Record<string, unknown> = {};
  const mudou = (campo: string, de: unknown, para: unknown) => {
    antes[campo] = de;
    depois[campo] = para;
  };
  const vazio: PlanoItemPlanilha = { set, reclassificar: false, antes, depois, erro: null };

  if ("idProduto" in pedido) {
    const v = texto(pedido.idProduto, LIMITES_ITEM_PLANILHA.codigo);
    if (v !== atual.idProduto) {
      set.idProduto = v;
      mudou("idProduto", atual.idProduto, v);
    }
  }
  if ("nomeProduto" in pedido) {
    const v = texto(pedido.nomeProduto, LIMITES_ITEM_PLANILHA.descricao);
    if (!v) return { ...vazio, erro: "A descrição do item é obrigatória." };
    if (v !== atual.nomeProduto) {
      set.nomeProduto = v;
      mudou("nomeProduto", atual.nomeProduto, v);
    }
  }
  if ("unidadeMedida" in pedido) {
    const v = texto(pedido.unidadeMedida, LIMITES_ITEM_PLANILHA.medida);
    if (v !== atual.unidadeMedida) {
      set.unidadeMedida = v;
      set.unidadeMedidaNorm = normUnidadeMedida(v);
      mudou("unidadeMedida", atual.unidadeMedida, v);
    }
  }
  for (const c of ["quantidade", "valorReferencia"] as const) {
    if (!(c in pedido)) continue;
    if (pedido[c] != null && numero(pedido[c]) == null) return { ...vazio, erro: `${c === "quantidade" ? "A quantidade" : "O valor unitário"} tem de ser um número maior ou igual a zero.` };
    const v = numero(pedido[c]);
    if (v !== atual[c]) {
      set[c] = v;
      mudou(c, atual[c], v);
    }
  }
  // O total: o digitado vale; senão, trocar quantidade/valor unitário recalcula (q × vu — a régua do item de protocolo).
  if ("valorTotal" in pedido) {
    if (pedido.valorTotal != null && numero(pedido.valorTotal) == null) return { ...vazio, erro: "O valor total tem de ser um número maior ou igual a zero." };
    const v = numero(pedido.valorTotal);
    if (v !== atual.valorTotal) {
      set.valorTotal = v;
      mudou("valorTotal", atual.valorTotal, v);
    }
  } else if ("quantidade" in set || "valorReferencia" in set) {
    const q = "quantidade" in set ? (set.quantidade ?? null) : atual.quantidade;
    const vu = "valorReferencia" in set ? (set.valorReferencia ?? null) : atual.valorReferencia;
    const v = totalDoItem(q, vu, atual.valorTotal);
    if (v !== atual.valorTotal) {
      set.valorTotal = v;
      mudou("valorTotal", atual.valorTotal, v);
    }
  }
  if ("previsao" in pedido) {
    const bruto = (pedido.previsao ?? "").trim();
    const generica = bruto ? previsaoGenericaDe(bruto) : null;
    const data = bruto && !generica ? parseDataDesejada(bruto) : null;
    if (bruto && !generica && !data) return { ...vazio, erro: "Previsão inválida: use MM/AAAA ou Anual, Semestral, Quadrimestral, Trimestral." };
    const novo = { dataDesejada: data?.iso ?? null, previsaoGenerica: generica };
    const de = previsaoDoItem(atual);
    const para = previsaoDoItem(novo);
    if (para !== de) {
      set.dataDesejada = novo.dataDesejada;
      set.previsaoGenerica = novo.previsaoGenerica;
      set.mesDesejado = data?.mes ?? null;
      set.anoDesejado = data?.ano ?? null;
      mudou("previsao", de, para);
    }
  }
  if ("prioridade" in pedido) {
    const bruto = (pedido.prioridade ?? "").trim();
    const v = bruto ? normPrioridade(bruto).valor : null;
    if (bruto && !v) return { ...vazio, erro: "Prioridade inválida: use Alta, Média ou Baixa." };
    if (v !== atual.prioridade) {
      set.prioridade = v;
      mudou("prioridade", atual.prioridade, v);
    }
  }
  const reclassificar = "idProduto" in set || "nomeProduto" in set || "unidadeMedida" in set;
  if (reclassificar) set.classificadoVersao = null;
  return { set, reclassificar, antes, depois, erro: null };
}

/** O resumo da auditoria: "Item Seq. 20344 da planilha editado: quantidade, valor total". */
export function resumoEdicaoItemPlanilha(sequencial: number | null, plano: PlanoItemPlanilha): string {
  const campos = Object.keys(plano.depois).map(rotuloCampoPlanilha);
  return `Item Seq. ${sequencial ?? "—"} da planilha editado: ${campos.join(", ")}`;
}
