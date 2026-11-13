import { subfluxosDoGrafo, type Grafo } from "./fluxo-core.ts";

/**
 * As automações que a MESA usa para TRATAR as divergências com a Centi (o painel do selo "Divergente"): a de RECONFERIR
 * (roda a conferência só para os DFDs escolhidos) e a de SUBSTITUIR os dados do DFD pelos da Centi. Achadas entre as que a
 * pessoa vê pelo que o diagrama FAZ (não pelo nome — pode ter sido renomeada); com várias, a de nome igual ao do modelo.
 * Pura.
 */
export type AutomacoesCenti = { conferir: { id: number; nome: string } | null; substituir: { id: number; nome: string } | null };
type FluxoLeve = { id: number; nome: string; grafo: Grafo };

const NOME_CONFERIR = "Conferir DFDs × Centi";
const NOME_SUBSTITUIR = "Substituir DFDs pelos dados da Centi";

const tem = (g: Grafo, tipo: string) => g.nos.some((n) => n.tipo === tipo && !n.desativado);
/** Começa lendo os DFDs do sistema (o que a Mesa entrega restringe a leitura aos DFDs dela). */
const leDfds = (g: Grafo) => g.nos.some((n) => n.tipo === "sistema.ler" && !n.desativado && String(n.config.objeto ?? "") === "dfds");

export function automacoesCentiDaMesa(fluxos: readonly FluxoLeve[]): AutomacoesCenti {
  const porId = new Map(fluxos.map((f) => [f.id, f]));
  const marca = (f: FluxoLeve, d = 0): boolean =>
    tem(f.grafo, "saida.marcarConferencia") || (d < 3 && subfluxosDoGrafo(f.grafo).some((id) => { const s = porId.get(id); return !!s && marca(s, d + 1); }));
  const escolher = (cands: FluxoLeve[], nome: string) => {
    const f = cands.find((x) => x.nome.trim() === nome) ?? cands[0];
    return f ? { id: f.id, nome: f.nome } : null;
  };
  return {
    conferir: escolher(fluxos.filter((f) => leDfds(f.grafo) && marca(f)), NOME_CONFERIR),
    substituir: escolher(fluxos.filter((f) => leDfds(f.grafo) && tem(f.grafo, "saida.substituirDfd")), NOME_SUBSTITUIR),
  };
}
