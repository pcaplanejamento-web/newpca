import { PermissaoExportar } from "@/components/ExportarTabelas";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PcaCompilacaoView } from "@/components/PcaCompilacaoView";
import { IconChevronLeft } from "@/components/icons";
import { acessoPagina } from "@/lib/acesso-pagina";
import { getPca } from "@/lib/dfd";

export const dynamic = "force-dynamic";

export default async function PcaEdicaoPage({ params }: { params: Promise<{ id: string }> }) {
  // Antes esta página não conferia nada (nem a sessão): o portão do PCA.
  const r = await acessoPagina("pca");
  if (r.bloqueio) return r.bloqueio;
  const id = Number((await params).id);
  const pca = Number.isInteger(id) && id > 0 ? await getPca(id) : null;
  if (!pca) notFound();

  return (
    <div className="space-y-[var(--gap-block)]">
      <Link
        href="/painel/pca"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-text-2"
      >
        <IconChevronLeft className="h-4 w-4" /> Voltar ao PCA
      </Link>
      <PermissaoExportar permitido={r.pode.exportar}>
        <PcaCompilacaoView pca={pca} />
      </PermissaoExportar>
    </div>
  );
}
