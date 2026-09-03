import { UploadForm } from "@/components/UploadForm";
import { IconBuilding } from "@/components/icons";
import { brl, dataBR, num } from "@/lib/format";
import { getUnidades } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const unidades = await getUnidades();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">
          Importar Planilha do PCA
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Envie o arquivo <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">.xlsx</code>{" "}
          da unidade. Os dados são normalizados e ficam disponíveis no
          dashboard.
        </p>
      </div>

      <UploadForm />

      {unidades.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Unidades já importadas ({unidades.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {unidades.map((u) => (
              <div
                key={u.id}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800">
                  <IconBuilding className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div
                    className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100"
                    title={u.municipio}
                  >
                    {u.municipio}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Código {u.codigo} · {num(u.totalItens ?? 0)} itens ·{" "}
                    {brl(u.valorTotal ?? 0)}
                  </div>
                  {u.atualizadoEm && (
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      atualizado em {dataBR(u.atualizadoEm)}
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
