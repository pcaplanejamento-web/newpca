import { CatalogoView } from "@/components/CatalogoView";
import { getUsuarioAtual } from "@/lib/auth";
import { getCatalogoItens, listarCatalogos } from "@/lib/catalogo";

export const dynamic = "force-dynamic";

// Módulo Catálogo (aba `catalogo`) — carrega a lista de catálogos + TODOS os itens
// (agrupados no cliente, como o dashboard). Acesso pela aba; edição só p/ editor.
export default async function CatalogoPage() {
  const u = await getUsuarioAtual();
  const [catalogos, itens] = await Promise.all([listarCatalogos(), getCatalogoItens()]);
  const podeEditar = u?.role === "admin" || u?.role === "gestor";
  return <CatalogoView catalogos={catalogos} itens={itens} podeEditar={podeEditar} />;
}
