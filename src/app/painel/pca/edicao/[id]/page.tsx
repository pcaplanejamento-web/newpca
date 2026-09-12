import Link from "next/link";
import { notFound } from "next/navigation";
import { PcaCompilacaoView } from "@/components/PcaCompilacaoView";
import { IconChevronLeft } from "@/components/icons";
import { getPca } from "@/lib/dfd";

export const dynamic = "force-dynamic";

export default async function PcaEdicaoPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const pca = Number.isInteger(id) && id > 0 ? await getPca(id) : null;
  if (!pca) notFound();

  return (
    <div className="space-y-4">
      <Link
        href="/painel/pca"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-text-2"
      >
        <IconChevronLeft className="h-4 w-4" /> Voltar ao PCA
      </Link>
      <PcaCompilacaoView pca={pca} />
    </div>
  );
}
