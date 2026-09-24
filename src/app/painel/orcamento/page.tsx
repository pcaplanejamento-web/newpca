import { OrcamentoView } from "@/components/OrcamentoView";
import { getUsuarioAtual } from "@/lib/auth";
import { alvosVinculoOrcamento, getOrcamentoItens, listarOrcamentos, listarVinculosOrcamento } from "@/lib/orcamento";
import { getPcaFiltro } from "@/lib/pca-filtro";

export const dynamic = "force-dynamic";

// Módulo Orçamento (aba `orcamento`) — carrega a lista de orçamentos + TODOS os
// lançamentos (agrupados no cliente, como o Catálogo) + os VÍNCULOS do Órgão/Unidade do CUBO
// com o cadastro (e os órgãos/unidades que podem ser alvo). Acesso pela aba; import/exclusão/
// vínculo só p/ editor. Com um PCA escolhido no CABEÇALHO (filtro global), só os orçamentos do ANO dele.
export default async function OrcamentoPage() {
  const [u, filtro] = await Promise.all([getUsuarioAtual(), getPcaFiltro()]);
  const ano = filtro?.ano ?? null;
  const [orcamentos, itens, vinculos, alvos] = await Promise.all([
    listarOrcamentos(ano),
    getOrcamentoItens(undefined, ano),
    listarVinculosOrcamento(),
    alvosVinculoOrcamento(),
  ]);
  const podeEditar = u?.role === "admin" || u?.role === "gestor";
  return (
    <OrcamentoView
      orcamentos={orcamentos}
      itens={itens}
      vinculos={vinculos}
      alvos={alvos}
      podeEditar={podeEditar}
      filtro={filtro ? `${filtro.nome} (${filtro.ano})` : null}
    />
  );
}
