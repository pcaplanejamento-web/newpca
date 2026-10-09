import { PcaModuleView } from "@/components/PcaModuleView";
import { pcasDoAcesso } from "@/lib/acesso";
import { acessoPagina } from "@/lib/acesso-pagina";
import { listarPcasCards } from "@/lib/pca-espaco";
import { getPcaFiltro } from "@/lib/pca-filtro";

export const dynamic = "force-dynamic";

// Tela do PCA: os planos em cards 4:5 (clicar = entrar no espaço do PCA). Com um PCA escolhido no CABEÇALHO (filtro
// global), só o card dele.
export default async function PcaPage() {
  const r = await acessoPagina("pca");
  if (r.bloqueio) return r.bloqueio;
  const [todos, filtro] = await Promise.all([listarPcasCards(), getPcaFiltro()]);
  // Só os PCAs do GRUPO ATIVO (Grupos → PCAs do grupo; o ADM, todos).
  const permitidos = pcasDoAcesso(r.acesso);
  const pcas = permitidos ? todos.filter((p) => permitidos.has(p.id)) : todos;
  return <PcaModuleView podeCriar={r.pode.configurar} pcas={filtro ? pcas.filter((p) => p.id === filtro.id) : pcas} filtro={filtro?.nome ?? null} />;
}
