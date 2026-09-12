import { PcaModuleView } from "@/components/PcaModuleView";
import { getUsuarioAtual } from "@/lib/auth";
import { listarDfds, listarPcas } from "@/lib/dfd";
import { getReparticaoContexto, getReparticaoFiltro } from "@/lib/grupos";
import { getUnidades } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function PcaPage() {
  const u = await getUsuarioAtual();
  // Head em "Geral" (rep=null) mostra tudo; senão só o da repartição ativa.
  const rep = await getReparticaoFiltro(u);
  const [unidades, dfds, pcas, repCtx] = await Promise.all([
    getUnidades(rep?.id),
    listarDfds(rep?.id),
    listarPcas(),
    getReparticaoContexto(u),
  ]);
  // Para gerar uma edição consolidada, o seletor mostra TODOS os DFDs (entre repartições).
  const todosDfds = rep ? await listarDfds() : dfds;
  const podeEditar = u?.role === "admin" || u?.role === "gestor";

  return (
    <PcaModuleView
      podeEditar={podeEditar}
      unidades={unidades}
      dfds={dfds}
      todosDfds={todosDfds}
      pcas={pcas}
      reparticoes={repCtx.lista}
      reparticaoAtivaId={repCtx.ativa?.id ?? null}
    />
  );
}
