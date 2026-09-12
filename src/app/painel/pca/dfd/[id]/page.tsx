import Link from "next/link";
import { notFound } from "next/navigation";
import { DfdDetalheView } from "@/components/DfdDetalheView";
import { IconChevronLeft } from "@/components/icons";
import { getDfd } from "@/lib/dfd";

export const dynamic = "force-dynamic";

export default async function DfdDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const dfd = Number.isInteger(id) && id > 0 ? await getDfd(id) : null;
  if (!dfd) notFound();

  return (
    <div className="space-y-4">
      <Link
        href="/painel/pca"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-text-2"
      >
        <IconChevronLeft className="h-4 w-4" /> Voltar ao PCA
      </Link>
      <DfdDetalheView dfd={dfd} />
    </div>
  );
}
