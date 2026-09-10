import Link from "next/link";
import { notFound } from "next/navigation";
import { TabelaEditor } from "@/components/TabelaEditor";
import { IconChevronLeft } from "@/components/icons";
import { getUsuarioAtual } from "@/lib/auth";
import { getTabelaDetalhe } from "@/lib/tabelas";

export const dynamic = "force-dynamic";

export default async function TabelaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const tabelaId = Number((await params).id);
  if (!Number.isInteger(tabelaId)) notFound();

  const [u, det] = await Promise.all([
    getUsuarioAtual(),
    getTabelaDetalhe(tabelaId),
  ]);
  if (!det) notFound();
  const podeEditar = u?.role === "admin" || u?.role === "gestor";

  return (
    <div className="space-y-4">
      <Link
        href="/painel/protocolos"
        className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-800 dark:hover:text-white"
      >
        <IconChevronLeft className="h-4 w-4" /> Voltar às tabelas
      </Link>
      <TabelaEditor
        tabelaId={tabelaId}
        nomeInicial={det.tabela.nome}
        colunasIniciais={det.colunas}
        podeEditar={podeEditar}
      />
    </div>
  );
}
