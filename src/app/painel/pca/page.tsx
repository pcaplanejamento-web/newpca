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
        className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 shadow-ring transition hover:border-border-2 hover:shadow-soft"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
          <IconDashboard className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-text">Dashboard do PCA</h3>
          <p className="mt-0.5 text-sm text-muted">
            Indicadores, gráficos e consulta de itens — página pública (todos veem).
          </p>
        </div>
        <IconChevronRight className="h-5 w-5 shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-muted" />
      </Link>

      {podeEditar ? (
        <UploadForm />
      ) : (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
          A importação de planilhas é feita por administradores e gestores.
        </p>
      )}

      {unidades.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-text-2">
            Unidades importadas ({unidades.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {unidades.map((un) => (
              <div
                key={un.id}
                className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                  <IconBuilding className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-text" title={un.municipio}>
                    {un.municipio}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    Código {un.codigo} · {num(un.totalItens ?? 0)} itens · {brl(un.valorTotal ?? 0)}
                  </div>
                  {un.atualizadoEm && (
                    <div className="mt-0.5 text-[11px] text-faint">
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
