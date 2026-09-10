import { redirect } from "next/navigation";
import { PerfilView } from "@/components/PerfilView";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const u = await getUsuarioAtual();
  if (!u) redirect("/login");
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Perfil</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sua conta, preferências e navegação.
        </p>
      </div>
      <PerfilView usuario={u} />
    </div>
  );
}
