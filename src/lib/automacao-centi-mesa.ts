import { subfluxosDoGrafo, type Grafo } from "./fluxo-core.ts";

/**
 * As automações que a MESA usa para TRATAR as divergências com a Centi (o painel do selo "Divergente" e a barra de seleção):
 * RECONFERIR (só confere — o disparo vai com `soConferir`, e o nó que grava respeita, também nos subfluxos) e CORRIGIR (confere
 * de novo e corrige o que diverge). As duas são, em regra, a MESMA automação — "Conferir e corrigir DFDs × Centi" —, achada
 * entre as que a pessoa vê pelo que o diagrama FAZ (não pelo nome — pode ter sido renomeada); com várias, a de nome igual ao
 * do modelo. Pura.
 */
export type AutomacoesCenti = { conferir: { id: number; nome: string } | null; corrigir: { id: number; nome: string } | null };
type FluxoLeve = { id: number; nome: string; grafo: Grafo };

const NOME_UNICA = "Conferir e corrigir DFDs × Centi";

const tem = (g: Grafo, tipo: string) => g.nos.some((n) => n.tipo === tipo && !n.desativado);
/** Começa lendo os DFDs do sistema (o que a Mesa entrega restringe a leitura aos DFDs dela). */
const leDfds = (g: Grafo) => g.nos.some((n) => n.tipo === "sistema.ler" && !n.desativado && String(n.config.objeto ?? "") === "dfds");

export function automacoesCentiDaMesa(fluxos: readonly FluxoLeve[]): AutomacoesCenti {
  const porId = new Map(fluxos.map((f) => [f.id, f]));
  /** O diagrama (ou um subfluxo dele, até 3 níveis) tem o nó. */
  const usa = (f: FluxoLeve, tipo: string, d = 0): boolean =>
    tem(f.grafo, tipo) || (d < 3 && subfluxosDoGrafo(f.grafo).some((id) => { const s = porId.get(id); return !!s && usa(s, tipo, d + 1); }));
  const escolher = (cands: FluxoLeve[]) => {
    const f = cands.find((x) => x.nome.trim() === NOME_UNICA) ?? cands[0];
    return f ? { id: f.id, nome: f.nome } : null;
  };
  // Lê DFDs e marca a conferência. O "Substituir DFD" (legado) não respeita o "só conferir" da mesma forma: fica de fora.
  const conferem = fluxos.filter((f) => leDfds(f.grafo) && usa(f, "saida.marcarConferencia") && !usa(f, "saida.substituirDfd"));
  return {
    conferir: escolher(conferem),
    corrigir: escolher(conferem.filter((f) => usa(f, "saida.corrigirPelaCenti"))),
  };
}
