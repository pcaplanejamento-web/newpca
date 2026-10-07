/**
 * LER DO SISTEMA (puro, testado em `tests/fluxo-ler-sistema.test.ts`): o nó que IDENTIFICA protocolos, DFDs e itens do
 * sistema — tudo (Geral) ou um recorte (Específico: os DFDs de um protocolo, os itens de um DFD, um produto…) — e os
 * entrega em LISTA ou UM POR VEZ (iterador com a porta "volta", como o Laço).
 */
import { interpolar, type Item } from "./fluxo-core.ts";

export type ObjetoLeitura = "protocolos" | "dfds" | "itens";
/** Por onde o recorte é feito ("todos" = Geral). */
export const BUSCAS: Record<ObjetoLeitura, { valor: string; rotulo: string }[]> = {
  protocolos: [
    { valor: "todos", rotulo: "Todos (geral)" },
    { valor: "numero", rotulo: "Nº do protocolo" },
    { valor: "id", rotulo: "Id do protocolo (capa)" },
  ],
  dfds: [
    { valor: "todos", rotulo: "Todos (geral)" },
    { valor: "planejamento", rotulo: "Nº de planejamento" },
    { valor: "numero", rotulo: "Nº do DFD" },
    { valor: "protocolo", rotulo: "Do protocolo (nº ou Id)" },
  ],
  itens: [
    { valor: "todos", rotulo: "Todos (geral)" },
    { valor: "planejamento", rotulo: "Do DFD (nº de planejamento)" },
    { valor: "dfd", rotulo: "Do DFD (nº do DFD)" },
    { valor: "protocolo", rotulo: "Do protocolo (nº ou Id)" },
    { valor: "produto", rotulo: "Produto (código)" },
  ],
};

/** As fontes já carregadas (cada uma lida UMA vez por execução). */
export type FontesSistema = { protocolos: Item[]; dfds: Item[]; itens: Item[] };

/** O número comparável: só os dígitos ANTES da barra, sem zeros à esquerda ("0144756/2026" → "144756"). */
const chaveNum = (v: unknown) => String(v ?? "").split("/")[0].replace(/\D/g, "").replace(/^0+(?=\d)/, "");

/** Os valores procurados: o texto do campo (vários por ";", ":" ou ","), com {{campo}} trocado pelo dado de CADA item que
 * chega; sem item que chega, o texto como está. */
export function valoresProcurados(valor: string, entrada: Item[]): string[] {
  const textos = /\{\{/.test(valor) ? (entrada.length ? entrada : [{}]).map((it) => interpolar(valor, it)) : [valor];
  const vals = textos.flatMap((t) => t.split(/[;:,\n]/)).map(chaveNum).filter(Boolean);
  return [...new Set(vals)];
}

/** A busca efetiva: com {{campo}} que NENHUM item que chega preenche (execução avulsa — o Início entrega um item sem
 * o campo —, a prévia da seleção), lê TODOS: a seleção mostra tudo e o usuário escolhe; com o campo nos itens (ex.: os
 * DFDs da Mesa), filtra pelo valor. Valor fixo vazio = `null` (erro). */
export function buscaEfetiva(busca: string, valor: string, valores: string[]): string | null {
  if (busca === "todos" || valores.length) return busca;
  return /\{\{/.test(valor) ? "todos" : null;
}

/** Os itens do recorte, na ordem da fonte (sem repetir). `todos` ignora os valores. */
export function lerDoSistema(f: FontesSistema, objeto: ObjetoLeitura, busca: string, valores: string[]): Item[] {
  const quer = new Set(valores);
  const tem = (v: unknown) => quer.has(chaveNum(v));
  const protoQuer = (p: Item) => tem(p.numero) || tem(p.idExterno);
  if (objeto === "protocolos") {
    if (busca === "todos") return f.protocolos;
    return f.protocolos.filter((p) => (busca === "id" ? tem(p.idExterno) : tem(p.numero)));
  }
  if (objeto === "dfds") {
    if (busca === "todos") return f.dfds;
    if (busca === "protocolo") {
      const nums = new Set(f.protocolos.filter(protoQuer).flatMap((p) => (Array.isArray(p.dfds) ? p.dfds : []).map((d) => chaveNum((d as Item).numero))));
      return f.dfds.filter((d) => nums.has(chaveNum(d.numero)) || protoQuer({ numero: d.protocolo, idExterno: d.protocoloIdExterno }));
    }
    return f.dfds.filter((d) => tem(busca === "numero" ? d.numero : d.planejamento));
  }
  if (busca === "todos") return f.itens;
  if (busca === "produto") return f.itens.filter((i) => tem(i.codigo));
  if (busca === "dfd") return f.itens.filter((i) => tem(i.dfdNumero));
  if (busca === "planejamento") return f.itens.filter((i) => tem(i.dfdPlanejamento));
  const protos = new Set(f.protocolos.filter(protoQuer).map((p) => chaveNum(p.numero)));
  return f.itens.filter((i) => protos.has(chaveNum(i.protocoloNumero)));
}

/** A porta "fim": os itens marcados `executado` (o fim do laço) — sem nenhum, um marcador só. */
export const marcarExecutado = (itens: Item[], total: number): Item[] =>
  (itens.length ? itens : [{}]).map((it) => ({ ...it, executado: true, totalLido: total }));
