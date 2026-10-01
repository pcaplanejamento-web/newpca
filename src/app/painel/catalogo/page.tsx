import { CatalogoView } from "@/components/CatalogoView";
import { acessoPagina } from "@/lib/acesso-pagina";
import { getCatalogoItens, listarCatalogos } from "@/lib/catalogo";
import { listarPastasCatalogo } from "@/lib/catalogo-historico";

export const dynamic = "force-dynamic";

// Módulo Catálogo (aba `catalogo`) — carrega a lista de catálogos + TODOS os itens (agrupados no cliente, como o
// dashboard). A tela abre para quem o grupo libera e o papel visualiza; o que se faz nela segue o papel (`pode`).
export default async function CatalogoPage() {
  const r = await acessoPagina("catalogo");
  if (r.bloqueio) return r.bloqueio;
  const [catalogos, itens, pastas] = await Promise.all([listarCatalogos(), getCatalogoItens(), listarPastasCatalogo()]);
  return <CatalogoView catalogos={catalogos} itens={itens} pode={r.pode} pastas={pastas} />;
}
