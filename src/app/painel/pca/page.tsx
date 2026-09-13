import { PcaModuleView } from "@/components/PcaModuleView";
import { getUsuarioAtual } from "@/lib/auth";
import { listarDfds, listarPcas } from "@/lib/dfd";
import { getReparticaoFiltro } from "@/lib/grupos";
import { getUnidades } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function PcaPage() {
  const u = await getUsuarioAtual();
  // Unidades (planilha achatada) seguem a repartição ativa do head; os DFDs do
  // seletor de "Gerar PCA" são TODOS (a edição consolida entre repartições).
  const rep = await getReparticaoFiltro(u);
  const [unidades, todosDfds, pcas] = await Promise.all([
    getUnidades(rep?.id),
    listarDfds(),
    listarPcas(),
  ]);
  const podeEditar = u?.role === "admin" || u?.role === "gestor";

  return <PcaModuleView podeEditar={podeEditar} unidades={unidades} todosDfds={todosDfds} pcas={pcas} />;
}
