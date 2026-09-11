import Link from "next/link";
import { IconSearch } from "@/components/icons";

// 404 amigável (App Router): renderizado para rotas inexistentes e `notFound()`.
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-6 py-16 text-center dark:bg-slate-950">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 text-emerald-500 dark:from-emerald-500/20 dark:to-emerald-500/5 dark:text-emerald-300">
        <IconSearch className="h-8 w-8" />
      </div>
      <p className="mt-5 text-3xl font-black tracking-tight text-slate-800 dark:text-white">404</p>
      <h1 className="mt-1 text-lg font-bold text-slate-800 dark:text-white">
        Página não encontrada
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
        O endereço acessado não existe ou foi movido.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
      >
        Ir para o início
      </Link>
    </div>
  );
}
