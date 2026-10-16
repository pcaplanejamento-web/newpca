/**
 * MESA CONECTADA — o RECORTE ÚNICO das visões Protocolos · DFDs · Itens (puro, testado).
 *
 * Cada visão guarda os PRÓPRIOS filtros de coluna; o que passa neles (calculado sobre a lista SEM a restrição das outras
 * visões — nunca há ciclo) restringe as outras pela hierarquia protocolo › DFD › item, nos DOIS sentidos:
 * - Protocolos filtrados → só os DFDs (e itens) desses protocolos;
 * - DFDs filtrados → só os itens desses DFDs e os protocolos que os contêm;
 * - Itens filtrados → só os DFDs que têm esses itens e os protocolos deles.
 * A restrição vem só por ids de protocolo e de DFD (estáveis numa regravação de itens).
 */

export type VisaoRecorte = "protocolos" | "dfds" | "itens";
export const VISOES_RECORTE: readonly VisaoRecorte[] = ["protocolos", "dfds", "itens"];
export const ROTULO_VISAO_RECORTE: Record<VisaoRecorte, string> = { protocolos: "Protocolos", dfds: "DFDs", itens: "Itens" };

/** O que cada visão deixa passar: `protocolos` = ids de protocolo; `dfds`/`itens` = ids de DFD. `null` = sem filtro. */
export type PassamRecorte = Record<VisaoRecorte, ReadonlySet<number> | null>;
export const SEM_RECORTE: PassamRecorte = { protocolos: null, dfds: null, itens: null };

export type DfdRecorte = { id: number; protocoloId: number | null };

export type Recorte = {
  /** O protocolo passa nas restrições que vêm de DFDs e Itens. */
  protocolo: (id: number) => boolean;
  /** O DFD passa nas restrições que vêm de Protocolos e Itens. */
  dfd: (d: DfdRecorte) => boolean;
  /** O item passa nas restrições que vêm de Protocolos e DFDs (pelo DFD de origem). */
  item: (dfdId: number) => boolean;
  ativo: boolean;
};

/** Os ids de DFD que passam numa visão → os protocolos que os contêm. */
function protocolosDosDfds(ids: ReadonlySet<number>, protoDoDfd: ReadonlyMap<number, number | null>): Set<number> {
  const s = new Set<number>();
  for (const id of ids) {
    const p = protoDoDfd.get(id);
    if (p != null) s.add(p);
  }
  return s;
}

/** O recorte da Mesa: `dfds` = TODOS os DFDs da Mesa (para ligar DFD → protocolo). */
export function recorteMesa(passam: PassamRecorte, dfds: readonly DfdRecorte[]): Recorte {
  const { protocolos: rp, dfds: rd, itens: ri } = passam;
  if (!rp && !rd && !ri) return { protocolo: () => true, dfd: () => true, item: () => true, ativo: false };
  const protoDoDfd = new Map<number, number | null>(dfds.map((d) => [d.id, d.protocoloId]));
  const protoDeD = rd ? protocolosDosDfds(rd, protoDoDfd) : null;
  const protoDeI = ri ? protocolosDosDfds(ri, protoDoDfd) : null;
  const protoOk = (p: number | null | undefined) => !rp || (p != null && rp.has(p));
  return {
    ativo: true,
    protocolo: (id) => (!protoDeD || protoDeD.has(id)) && (!protoDeI || protoDeI.has(id)),
    dfd: (d) => protoOk(d.protocoloId) && (!ri || ri.has(d.id)),
    item: (dfdId) => protoOk(protoDoDfd.get(dfdId)) && (!rd || rd.has(dfdId)),
  };
}

/** Quantos filtros uma visão tem (para o chip "Protocolos: 2 filtros"). */
export function contarFiltros(filtros: Record<string, unknown> | undefined): number {
  return filtros ? Object.keys(filtros).length : 0;
}

/** O texto do chip de uma visão com filtros. */
export function rotuloChipRecorte(v: VisaoRecorte, n: number): string {
  return `${ROTULO_VISAO_RECORTE[v]}: ${n} ${n === 1 ? "filtro" : "filtros"}`;
}

/** Dois conjuntos (ou "sem filtro") iguais — evita gravar de novo o mesmo recorte. */
export function mesmoConjunto(a: ReadonlySet<number> | null, b: ReadonlySet<number> | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
