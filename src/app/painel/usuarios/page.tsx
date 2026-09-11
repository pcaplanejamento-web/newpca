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

  return <UsuariosAdmin meuId={atual.id} />;
}
