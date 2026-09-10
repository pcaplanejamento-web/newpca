import { ProtocolosClient } from "@/components/ProtocolosClient";
import { getUsuarioAtual } from "@/lib/auth";
import { usuariosAtivos } from "@/lib/protocolos";

export const dynamic = "force-dynamic";

export default async function ProtocolosPage() {
  const [atual, usuarios] = await Promise.all([getUsuarioAtual(), usuariosAtivos()]);
  const podeEditar = atual?.role === "admin" || atual?.role === "gestor";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">
          Protocolos
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Distribuição e acompanhamento dos protocolos da equipe.
        </p>
      </div>
      <ProtocolosClient usuarios={usuarios} podeEditar={podeEditar} />
    </div>
  );
}
