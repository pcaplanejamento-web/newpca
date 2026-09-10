import { IconShield } from "./icons";

/** Card padrão para páginas sem permissão para o papel atual. */
export function AcessoRestrito({
  mensagem = "Você não tem permissão para acessar esta área.",
}: {
  mensagem?: string;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
        <IconShield className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-lg font-bold text-slate-800 dark:text-white">
        Acesso restrito
      </h2>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{mensagem}</p>
    </div>
  );
}
