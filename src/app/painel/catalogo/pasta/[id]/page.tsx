import { notFound } from "next/navigation";
import { CatalogoView } from "@/components/CatalogoView";
import { acessoPagina } from "@/lib/acesso-pagina";
import { getCatalogoItens, listarCatalogos } from "@/lib/catalogo";
import { listarPastasCatalogo } from "@/lib/catalogo-historico";

export const dynamic = "force-dynamic";

// A TELA DA PASTA do Catálogo — só os catálogos dela (cards, Lista de Itens e os números do conjunto), com a MESMA tela do
// módulo (`CatalogoView pasta`). Pasta inexistente = 404.
export default async function PastaCatalogoPage({ params }: { params: Promise<{ id: string }> }) {
  const r = await acessoPagina("catalogo");
  if (r.bloqueio) return r.bloqueio;
  const id = Number((await params).id);
  const [catalogos, itens, pastas] = await Promise.all([listarCatalogos(), getCatalogoItens(), listarPastasCatalogo()]);
  const pasta = Number.isInteger(id) ? pastas.find((p) => p.id === id) : undefined;
  if (!pasta) notFound();
  return <CatalogoView catalogos={catalogos} itens={itens} pode={r.pode} pastas={pastas} pasta={pasta} />;
}
