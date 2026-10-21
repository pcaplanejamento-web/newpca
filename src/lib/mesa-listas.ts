import type { ConfsGuardadas } from "./conferencia-cache-core";

/**
 * As LISTAS GRANDES da Mesa (protocolos + DFDs) num ÚNICO texto JSON. Enviadas como objetos, cada valor de cada linha
 * passava pelo serializador do React — no servidor, de novo no servidor para montar o HTML (F5) e no navegador —, o que
 * na Mesa de um PCA grande (milhares de linhas) estourava o limite de CPU do Worker e cortava a resposta no meio. Em texto,
 * o servidor faz UM `JSON.stringify` e o cliente UM `JSON.parse` (nativos). `carga` = a hora da carga: cada carga do
 * servidor vira listas NOVAS no cliente, como antes (os efeitos que dependem da referência das listas seguem iguais).
 * `confs` = os Estados GUARDADOS que conferem com a assinatura atual (a Mesa abre sem "Conferindo…").
 * As linhas são do banco (texto/número/nulo — sem datas nem `undefined`): o JSON as devolve iguais. Puro.
 */
export type ListasMesa<P, D> = { protocolos: P[]; dfds: D[]; confs?: ConfsGuardadas };

/** As listas → o texto que vai ao cliente. */
export function listasParaTexto<P, D>(l: ListasMesa<P, D>, carga: number): string {
  return JSON.stringify({ carga, protocolos: l.protocolos, dfds: l.dfds, confs: l.confs });
}

/** O texto → as listas (tolerante: texto inválido ou campo que não é lista = lista vazia, nunca quebra a tela). */
export function listasDoTexto<P, D>(texto: string | null | undefined): ListasMesa<P, D> {
  let v: unknown;
  try {
    v = JSON.parse(texto ?? "");
  } catch {
    return { protocolos: [], dfds: [], confs: { dfds: [], protocolos: [] } };
  }
  const o = v && typeof v === "object" ? (v as { protocolos?: unknown; dfds?: unknown; confs?: { dfds?: unknown; protocolos?: unknown } }) : {};
  const c = o.confs && typeof o.confs === "object" ? o.confs : null;
  return {
    protocolos: Array.isArray(o.protocolos) ? (o.protocolos as P[]) : [],
    dfds: Array.isArray(o.dfds) ? (o.dfds as D[]) : [],
    confs: {
      dfds: Array.isArray(c?.dfds) ? (c.dfds as ConfsGuardadas["dfds"]) : [],
      protocolos: Array.isArray(c?.protocolos) ? (c.protocolos as ConfsGuardadas["protocolos"]) : [],
    },
  };
}
