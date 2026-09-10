import { UsuariosAdmin } from "@/components/UsuariosAdmin";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const atual = await getUsuarioAtual();

  if (!atual || atual.role !== "admin") {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">
          Acesso restrito
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Somente administradores podem gerenciar usuários.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">
          Usuários
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Aprove novos cadastros, defina papéis e gerencie o acesso da equipe.
        </p>
      </div>
      <UsuariosAdmin meuId={atual.id} />
    </div>
  );
}
