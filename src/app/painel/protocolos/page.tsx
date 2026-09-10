import { TabelasIndex } from "@/components/TabelasIndex";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProtocolosPage() {
  const u = await getUsuarioAtual();
  const podeEditar = u?.role === "admin" || u?.role === "gestor";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">
          Protocolos e listas
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Suas tabelas de controle. Abra uma para editar ou crie uma nova.
        </p>
      </div>
      <TabelasIndex podeEditar={podeEditar} />
    </div>
  );
}
