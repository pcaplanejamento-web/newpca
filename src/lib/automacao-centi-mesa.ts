import { subfluxosDoGrafo, type Grafo } from "./fluxo-core.ts";

/**
 * A automação que a MESA usa para TRATAR as divergências com a Centi (o painel do selo "Divergente" e a barra de seleção):
 * a "Verificar DFDs na Centi" — o Reconferir e o Corrigir automaticamente rodam ela com a AÇÃO (`AcaoCenti`: só o conteúdo;
 * "conferir" nada altera, "corrigir" corrige). Achada entre as que a pessoa vê pelo que o diagrama FAZ (não pelo nome — pode
 * ter sido renomeada); com várias, a de nome igual ao do modelo. `null` = nenhuma. Pura.
 */
export type AutomacaoCenti = { id: number; nome: string } | null;
type FluxoLeve = { id: number; nome: string; grafo: Grafo };

const NOME_UNICA = "Verificar DFDs na Centi";

const tem = (g: Grafo, tipo: string) => g.nos.some((n) => n.tipo === tipo && !n.desativado);
/** Começa lendo os DFDs do sistema (o que a Mesa entrega restringe a leitura aos DFDs dela). */
const leDfds = (g: Grafo) => g.nos.some((n) => n.tipo === "sistema.ler" && !n.desativado && String(n.config.objeto ?? "") === "dfds");

export function automacaoCentiDaMesa(fluxos: readonly FluxoLeve[]): AutomacaoCenti {
  const porId = new Map(fluxos.map((f) => [f.id, f]));
  /** O diagrama (ou um subfluxo dele, até 3 níveis) tem o nó. */
  const usa = (f: FluxoLeve, tipo: string, d = 0): boolean =>
    tem(f.grafo, tipo) || (d < 3 && subfluxosDoGrafo(f.grafo).some((id) => { const s = porId.get(id); return !!s && usa(s, tipo, d + 1); }));
  // Lê DFDs, marca a conferência e corrige. O "Substituir DFD" (legado) não respeita o "só conferir": fica de fora.
  const cands = fluxos.filter((f) => leDfds(f.grafo) && usa(f, "saida.marcarConferencia") && usa(f, "saida.corrigirPelaCenti") && !usa(f, "saida.substituirDfd"));
  const f = cands.find((x) => x.nome.trim() === NOME_UNICA) ?? cands[0];
  return f ? { id: f.id, nome: f.nome } : null;
}
