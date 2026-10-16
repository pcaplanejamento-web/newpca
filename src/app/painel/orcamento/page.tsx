import { OrcamentoView } from "@/components/OrcamentoView";
import { acessoPagina } from "@/lib/acesso-pagina";
import { resumosNaUnidade } from "@/lib/comparativo-dados";
import { unidadeDoModulo } from "@/lib/escopo-cabecalho";
import { listarOrcamentos } from "@/lib/orcamento";
import { getPcaFiltro } from "@/lib/pca-filtro";

export const dynamic = "force-dynamic";

// Módulo Orçamento (aba `orcamento`) — a LISTA de orçamentos (cards 4:5; só o resumo de cada um — os lançamentos,
// vínculos e visões carregam na TELA DO ORÇAMENTO, `/painel/orcamento/[id]`). Importar segue o papel. Com um PCA
// escolhido no CABEÇALHO (filtro global), só os orçamentos do ANO dele.
export default async function OrcamentoPage() {
  const r = await acessoPagina("orcamento");
  if (r.bloqueio) return r.bloqueio;
  const [filtro, todos, rep] = await Promise.all([getPcaFiltro(), listarOrcamentos(), unidadeDoModulo("orcamento")]);
  // A unidade do CABEÇALHO (Configurações → Filtro da unidade): os indicadores só dos lançamentos vinculados a ela.
  const orcamentos = await resumosNaUnidade(filtro ? todos.filter((o) => o.ano === filtro.ano) : todos, rep.id === null ? null : { id: rep.id, semVinculo: rep.cfg.orcamentoSemVinculo });
  return (
    <OrcamentoView orcamentos={orcamentos} existentes={todos} podeImportar={r.pode.importar} filtro={filtro ? `${filtro.nome} (${filtro.ano})` : null} />
  );
}
