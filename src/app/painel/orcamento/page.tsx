import { OrcamentoView } from "@/components/OrcamentoView";
import { acessoPagina } from "@/lib/acesso-pagina";
import { listarOrcamentos } from "@/lib/orcamento";
import { getPcaFiltro } from "@/lib/pca-filtro";

export const dynamic = "force-dynamic";

// Módulo Orçamento (aba `orcamento`) — a LISTA de orçamentos (cards 4:5; só o resumo de cada um — os lançamentos,
// vínculos e visões carregam na TELA DO ORÇAMENTO, `/painel/orcamento/[id]`). Importar segue o papel. Com um PCA
// escolhido no CABEÇALHO (filtro global), só os orçamentos do ANO dele.
export default async function OrcamentoPage() {
  const r = await acessoPagina("orcamento");
  if (r.bloqueio) return r.bloqueio;
  const filtro = await getPcaFiltro();
  const todos = await listarOrcamentos();
  const orcamentos = filtro ? todos.filter((o) => o.ano === filtro.ano) : todos;
  return (
    <OrcamentoView orcamentos={orcamentos} existentes={todos} podeImportar={r.pode.importar} filtro={filtro ? `${filtro.nome} (${filtro.ano})` : null} />
  );
}
