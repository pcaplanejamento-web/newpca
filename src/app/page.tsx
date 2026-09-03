import Link from "next/link";
import { KpiCard } from "@/components/KpiCard";
import { ChartCard } from "@/components/ChartCard";
import { UnitFilter } from "@/components/UnitFilter";
import { ItemTable } from "@/components/ItemTable";
import { ClassificacaoChart } from "@/components/charts/ClassificacaoChart";
import { MensalChart } from "@/components/charts/MensalChart";
import { UnidadeChart } from "@/components/charts/UnidadeChart";
import { TopItensChart } from "@/components/charts/TopItensChart";
import {
  IconBox,
  IconInbox,
  IconTrend,
  IconTrophy,
  IconUpload,
  IconWallet,
} from "@/components/icons";
import { brl, num } from "@/lib/format";
import {
  getAnos,
  getClassificacoes,
  getPorClassificacao,
  getPorMes,
  getPorUnidadeMedida,
  getResumo,
  getTopItens,
  getUnidades,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ unidade?: string }>;
}) {
  const sp = await searchParams;
  const unidades = await getUnidades();

  // Estado vazio: nenhuma planilha importada ainda.
  if (unidades.length === 0) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
          <IconInbox className="h-8 w-8" />
        </div>
        <h2 className="mt-5 text-lg font-bold text-slate-800 dark:text-white">
          Nenhuma planilha importada
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Importe a planilha do PCA (.xlsx) para visualizar os indicadores,
          gráficos e a consulta de itens.
        </p>
        <Link
          href="/upload"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          <IconUpload className="h-[18px] w-[18px]" />
          Importar planilha
        </Link>
      </div>
    );
  }

  const parsedId = sp.unidade ? parseInt(sp.unidade, 10) : NaN;
  const unidadeId =
    Number.isFinite(parsedId) && unidades.some((u) => u.id === parsedId)
      ? parsedId
      : undefined;

  const [resumo, porClass, porMes, porUnidade, top, classificacoes, anos] =
    await Promise.all([
      getResumo(unidadeId),
      getPorClassificacao(unidadeId),
      getPorMes(unidadeId),
      getPorUnidadeMedida(unidadeId),
      getTopItens(unidadeId, 10),
      getClassificacoes(unidadeId),
      getAnos(unidadeId),
    ]);

  return (
    <div className="space-y-6">
      {/* Cabeçalho + filtro */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">
            Indicadores Gerais
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {unidadeId
              ? "Dados da unidade selecionada"
              : `Consolidado de ${num(resumo.numUnidades)} unidade(s)`}
          </p>
        </div>
        <div className="sm:w-80">
          <UnitFilter unidades={unidades} current={unidadeId} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total Planejado"
          value={brl(resumo.total)}
          subtitle={`em ${num(resumo.count)} itens`}
          icon={<IconWallet className="h-6 w-6" />}
          gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
        />
        <KpiCard
          title="Qtd. de Itens"
          value={num(resumo.count)}
          subtitle={
            unidadeId
              ? "itens na unidade"
              : `${num(resumo.numUnidades)} unidade(s)`
          }
          icon={<IconBox className="h-6 w-6" />}
          gradient="bg-gradient-to-br from-emerald-500 to-green-600"
        />
        <KpiCard
          title="Ticket Médio"
          value={brl(resumo.ticket)}
          subtitle="por item"
          icon={<IconTrend className="h-6 w-6" />}
          gradient="bg-gradient-to-br from-orange-500 to-amber-600"
        />
        <KpiCard
          title="Maior Item"
          value={brl(resumo.maiorValor)}
          subtitle={resumo.maiorNome ?? "—"}
          icon={<IconTrophy className="h-6 w-6" />}
          gradient="bg-gradient-to-br from-fuchsia-500 to-purple-600"
        />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Classificação dos Itens"
          subtitle="Distribuição do valor por categoria"
        >
          <ClassificacaoChart data={porClass} />
        </ChartCard>

        <ChartCard
          title="Cronograma Mensal"
          subtitle="Valor planejado por mês desejado"
        >
          <MensalChart data={porMes} />
        </ChartCard>

        <ChartCard
          title="Top 10 Itens por Valor"
          subtitle="Maiores contratações planejadas"
        >
          <TopItensChart data={top} />
        </ChartCard>

        <ChartCard
          title="Unidades de Medida"
          subtitle="Itens por unidade de medida"
        >
          <UnidadeChart data={porUnidade} />
        </ChartCard>
      </div>

      {/* Consulta de itens */}
      <ChartCard
        title="Consulta de Itens"
        subtitle="Busque, filtre e ordene os itens do PCA"
      >
        <ItemTable
          unidadeId={unidadeId}
          classificacoes={classificacoes}
          anos={anos}
          showUnidade={!unidadeId}
        />
      </ChartCard>
    </div>
  );
}
