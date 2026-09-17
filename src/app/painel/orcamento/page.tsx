import { OrcamentoView } from "@/components/OrcamentoView";
import { getUsuarioAtual } from "@/lib/auth";
import { getOrcamentoItens, listarOrcamentos } from "@/lib/orcamento";

export const dynamic = "force-dynamic";

// Módulo Orçamento (aba `orcamento`) — carrega a lista de orçamentos + TODOS os
// lançamentos (agrupados no cliente, como o Catálogo). Acesso pela aba; import/exclusão
// só p/ editor.
export default async function OrcamentoPage() {
  const u = await getUsuarioAtual();
  const [orcamentos, itens] = await Promise.all([listarOrcamentos(), getOrcamentoItens()]);
  const podeEditar = u?.role === "admin" || u?.role === "gestor";
  return <OrcamentoView orcamentos={orcamentos} itens={itens} podeEditar={podeEditar} />;
}
