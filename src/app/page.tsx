import Link from "next/link";
import { KpiCard } from "@/components/KpiCard";
import { ChartCard } from "@/components/ChartCard";
import { UnitFilter } from "@/components/UnitFilter";
import { ItemTable } from "@/components/ItemTable";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ClassificacaoChart } from "@/components/charts/ClassificacaoChart";
import { MensalChart } from "@/components/charts/MensalChart";
import { UnidadeChart } from "@/components/charts/UnidadeChart";
import { TopItensChart } from "@/components/charts/TopItensChart";
import { IconBox, IconInbox, IconTrend, IconTrophy, IconWallet } from "@/components/icons";
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

function Topo() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-700 text-sm font-black text-white shadow-sm">
            RV
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-slate-900 dark:text-white">Plataforma PCA</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Prefeitura de Rio Verde
            </div>
          </div>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/login"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            Entrar
          </Link>
        </div>
      </div>
    </header>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ unidade?: string }>;
}) {
  const sp = await searchParams;
  const unidades = await getUnidades();

  if (unidades.length === 0) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
        <Topo />
        <main className="px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-lg flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
              <IconInbox className="h-8 w-8" />
            </div>
            <p className="mt-5 text-base font-bold text-slate-800 dark:text-white">
              Dados do PCA em breve
            </p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              A equipe ainda não publicou a planilha do Plano de Contratações Anual.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const parsedId = sp.unidade ? parseInt(sp.unidade, 10) : NaN;
  const unidadeId =
    Number.isFinite(parsedId) && unidades.some((u) => u.id === parsedId) ? parsedId : undefined;

  const [resumo, porClass, porMes, porUnidade, top, classificacoes, anos] = await Promise.all([
    getResumo(unidadeId),
    getPorClassificacao(unidadeId),
    getPorMes(unidadeId),
    getPorUnidadeMedida(unidadeId),
    getTopItens(unidadeId, 10),
    getClassificacoes(unidadeId),
    getAnos(unidadeId),
  ]);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <Topo />
      <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex justify-end">
          <div className="sm:w-80">
            <UnitFilter unidades={unidades} current={unidadeId} />
          </div>
        </div>

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
            subtitle={unidadeId ? "itens na unidade" : `${num(resumo.numUnidades)} unidade(s)`}
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

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Classificação dos Itens" subtitle="Distribuição do valor por categoria">
            <ClassificacaoChart data={porClass} />
          </ChartCard>
          <ChartCard title="Cronograma Mensal" subtitle="Valor planejado por mês desejado">
            <MensalChart data={porMes} />
          </ChartCard>
          <ChartCard title="Top 10 Itens por Valor" subtitle="Maiores contratações planejadas">
            <TopItensChart data={top} />
          </ChartCard>
          <ChartCard title="Unidades de Medida" subtitle="Itens por unidade de medida">
            <UnidadeChart data={porUnidade} />
          </ChartCard>
        </div>

        <ChartCard title="Consulta de Itens" subtitle="Busque, filtre e ordene os itens do PCA">
          <ItemTable
            unidadeId={unidadeId}
            classificacoes={classificacoes}
            anos={anos}
            showUnidade={!unidadeId}
          />
        </ChartCard>
      </main>
    </div>
  );
}
