import Link from "next/link";
import { UploadForm } from "@/components/UploadForm";
import { IconBuilding, IconChevronRight, IconDashboard } from "@/components/icons";
import { brl, dataBR, num } from "@/lib/format";
import { getUsuarioAtual } from "@/lib/auth";
import { getUnidades } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function PcaPage() {
  const [u, unidades] = await Promise.all([getUsuarioAtual(), getUnidades()]);
  const podeEditar = u?.role === "admin" || u?.role === "gestor";

  return (
    <div className="space-y-6">
      {/* Atalho para o dashboard público */}
      <Link
        href="/"
        className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
          <IconDashboard className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-slate-800 dark:text-white">Dashboard do PCA</h3>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Indicadores, gráficos e consulta de itens — página pública (todos veem).
          </p>
        </div>
        <IconChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 dark:text-slate-600" />
      </Link>

      {podeEditar ? (
        <UploadForm />
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          A importação de planilhas é feita por administradores e gestores.
        </p>
      )}

      {unidades.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Unidades importadas ({unidades.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {unidades.map((un) => (
              <div
                key={un.id}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800">
                  <IconBuilding className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div
                    className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100"
                    title={un.municipio}
                  >
                    {un.municipio}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Código {un.codigo} · {num(un.totalItens ?? 0)} itens · {brl(un.valorTotal ?? 0)}
                  </div>
                  {un.atualizadoEm && (
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      atualizado em {dataBR(un.atualizadoEm)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
