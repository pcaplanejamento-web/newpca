import { OrcamentoView } from "@/components/OrcamentoView";
import { getUsuarioAtual } from "@/lib/auth";
import { listarOrcamentos } from "@/lib/orcamento";
import { getPcaFiltro } from "@/lib/pca-filtro";

export const dynamic = "force-dynamic";

// Módulo Orçamento (aba `orcamento`) — a LISTA de orçamentos (cards 4:5; só o resumo de cada um — os lançamentos,
// vínculos e visões carregam na TELA DO ORÇAMENTO, `/painel/orcamento/[id]`). Importação só p/ editor. Com um PCA
// escolhido no CABEÇALHO (filtro global), só os orçamentos do ANO dele.
export default async function OrcamentoPage() {
  const [u, filtro] = await Promise.all([getUsuarioAtual(), getPcaFiltro()]);
  const orcamentos = await listarOrcamentos(filtro?.ano ?? null);
  const podeEditar = u?.role === "admin" || u?.role === "gestor";
  return <OrcamentoView orcamentos={orcamentos} podeEditar={podeEditar} filtro={filtro ? `${filtro.nome} (${filtro.ano})` : null} />;
}
