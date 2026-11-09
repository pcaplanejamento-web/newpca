import { PermissaoExportar } from "@/components/ExportarTabelas";
import { Suspense } from "react";
import { EsqueletoBarraCatalogo, EsqueletoVistaCatalogo } from "@/components/CatalogoEsqueleto";
import { CatalogoView } from "@/components/CatalogoView";
import { EsqueletoTela } from "@/components/EsqueletoTela";
import type { PodeTela } from "@/lib/papeis-core";
import { acessoPagina } from "@/lib/acesso-pagina";
import { getCatalogoItens, listarCatalogos } from "@/lib/catalogo";
import { unidadeDoCatalogo } from "@/lib/escopo-cabecalho";
import { listarPastasCatalogo } from "@/lib/catalogo-historico";

export const dynamic = "force-dynamic";

// Módulo Catálogo (aba `catalogo`) — carrega a lista de catálogos + TODOS os itens (agrupados no cliente, como o
// dashboard). A tela abre para quem o grupo libera e o papel visualiza; o que se faz nela segue o papel (`pode`).
export default async function CatalogoPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const r = await acessoPagina("catalogo");
  if (r.bloqueio) return r.bloqueio;
  const { vista } = await searchParams;
  // Os dados no Suspense com o esqueleto DA VISÃO PEDIDA (o `loading.tsx` só desenha a barra: não lê o `?vista=`).
  return (
    <Suspense
      fallback={
        <EsqueletoTela>
          <EsqueletoBarraCatalogo />
          <EsqueletoVistaCatalogo vista={vista} />
        </EsqueletoTela>
      }
    >
      <ConteudoCatalogo pode={r.pode} vista={vista} />
    </Suspense>
  );
}

async function ConteudoCatalogo({ pode, vista }: { pode: PodeTela; vista?: string }) {
  const [catalogos, itens, pastas] = await Promise.all([listarCatalogos(), unidadeDoCatalogo().then((rep) => getCatalogoItens(undefined, rep)), listarPastasCatalogo()]);
  return (
    <PermissaoExportar permitido={pode.exportar}>
      <CatalogoView catalogos={catalogos} itens={itens} pode={pode} pastas={pastas} vistaInicial={vista} />
    </PermissaoExportar>
  );
}
