/**
 * O TIPO dos itens que passam por uma automação — para mostrar a MESMA tabela da Mesa (protocolos · DFDs · itens) e abrir o
 * MESMO banner ao tocar na linha. Puro (testado em `tests/fluxo-tipo-item.test.ts`).
 */
import { tipoCurtoDfd } from "./parse-dfd-comum.ts";

type Item = Record<string, unknown>;
export type TipoItemMesa = "protocolo" | "dfd" | "item";
/** O mesmo formato da `AberturaMesa` (a pilha de banners da Mesa). */
export type AberturaItem = { tipo: "protocolo"; id: number } | { tipo: "dfd"; id: number } | { tipo: "item"; dfdId: number; itemId: number; item: { item: number | null; codigo: string | null } };

const txt = (v: unknown) => (v == null ? "" : String(v).trim());
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(txt(v));
  return Number.isFinite(n) && txt(v) !== "" ? n : null;
};
const idPositivo = (v: unknown) => {
  const n = num(v);
  return n != null && n > 0 && Number.isInteger(n) ? n : null;
};

/** O tipo de UM item (ou `null` = outro dado: repartição, linha da CM002, tabela salva…). */
export function tipoDoItem(it: Item): TipoItemMesa | null {
  if (idPositivo(it.dfdId) != null && idPositivo(it.id) != null && "descricao" in it) return "item";
  if (idPositivo(it.id) != null && txt(it.numero) && txt(it.planejamento)) return "dfd";
  if (idPositivo(it.id) != null && (Array.isArray(it.dfds) || (txt(it.numero) && "idExterno" in it && !("planejamento" in it)))) return "protocolo";
  return null;
}

/** O tipo da LISTA: todos do mesmo tipo (a amostra dos primeiros); misturado ou vazio = `null` (a tabela genérica). */
export function tipoDosItens(itens: readonly Item[], amostra = 50): TipoItemMesa | null {
  const lista = itens.slice(0, amostra);
  if (!lista.length) return null;
  const t = tipoDoItem(lista[0]);
  return t && lista.every((it) => tipoDoItem(it) === t) ? t : null;
}

/** O banner que a linha abre na pilha da Mesa (`null` = nenhum). */
export function aberturaDoItem(it: Item): AberturaItem | null {
  const t = tipoDoItem(it);
  if (t === "item") return { tipo: "item", dfdId: idPositivo(it.dfdId) as number, itemId: idPositivo(it.id) as number, item: { item: num(it.item), codigo: txt(it.codigo) || null } };
  if (t === "dfd") return { tipo: "dfd", id: idPositivo(it.id) as number };
  if (t === "protocolo") return { tipo: "protocolo", id: idPositivo(it.id) as number };
  return null;
}

/** Os dados de um DFD para a planilha de DFDs da Mesa (`LinhaDfd` sem o estado — a automação não confere). */
export function dadosDfdDoItem(it: Item) {
  const execucao = txt(it.execucaoCenti);
  const conferencia = txt(it.conferenciaCenti);
  return {
    key: idPositivo(it.id) as number,
    numero: txt(it.numero),
    planejamento: txt(it.planejamento) || null,
    sigla: txt(it.sigla),
    tipo: tipoCurtoDfd(txt(it.tipo) || null),
    itens: num(it.totalItens ?? it.itens),
    valor: num(it.valor ?? it.valorTotal),
    protocolo: txt(it.protocolo) || null,
    ...(execucao ? { execucao } : {}),
    ...(conferencia ? { conferencia: { status: conferencia, motivo: txt(it.conferenciaCentiMotivo) || null } } : {}),
  };
}
