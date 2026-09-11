import Link from "next/link";
import { IconSearch } from "@/components/icons";

// 404 amigável (App Router): renderizado para rotas inexistentes e `notFound()`.
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-6 py-16 text-center dark:bg-slate-950">
      <div className="grid h-16 w-16 place-items-center rounded-card bg-accent-soft text-accent">
        <IconSearch className="h-8 w-8" />
      </div>
      <p className="mt-5 text-3xl font-black tracking-tight text-slate-800 dark:text-surface">404</p>
      <h1 className="mt-1 text-lg font-bold text-slate-800 dark:text-surface">
        Página não encontrada
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
        O endereço acessado não existe ou foi movido.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-text px-4 py-2.5 text-sm font-semibold text-surface transition hover:opacity-90"
      >
        Ir para o início
      </Link>
    </div>
  );
}
