import Link from "next/link";
import { TabelasIndex } from "@/components/TabelasIndex";
import { IconChevronLeft } from "@/components/icons";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TabelasPage() {
  const u = await getUsuarioAtual();
  const podeEditar = u?.role === "admin" || u?.role === "gestor";

  return (
    <div className="space-y-6">
      <Link
        href="/painel/ferramentas"
        className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-800 dark:hover:text-white"
      >
        <IconChevronLeft className="h-4 w-4" /> Ferramentas
      </Link>
      <div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">
          Tabelas dinâmicas
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Listas com colunas personalizáveis. Abra uma para editar ou crie uma nova.
        </p>
      </div>
      <TabelasIndex podeEditar={podeEditar} />
    </div>
  );
}
