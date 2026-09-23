import { PcaModuleView } from "@/components/PcaModuleView";
import { getUsuarioAtual } from "@/lib/auth";
import { listarPcasCards } from "@/lib/pca-espaco";

export const dynamic = "force-dynamic";

// Tela do PCA: os planos em cards 4:5 (clicar = entrar no espaço do PCA).
export default async function PcaPage() {
  const u = await getUsuarioAtual();
  const pcas = await listarPcasCards();
  const podeEditar = u?.role === "admin" || u?.role === "gestor";
  return <PcaModuleView podeEditar={podeEditar} pcas={pcas} />;
}
