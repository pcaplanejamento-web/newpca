import { Button } from "@/components/Button";
import { ChartCard } from "@/components/ChartCard";
import { ClassificacaoChart } from "@/components/charts/ClassificacaoChart";
import { MensalChart } from "@/components/charts/MensalChart";
import { TopItensChart } from "@/components/charts/TopItensChart";
import { UnidadeChart } from "@/components/charts/UnidadeChart";
import { IconInbox } from "@/components/icons";
import { ItemTable } from "@/components/ItemTable";
import { KpiStat } from "@/components/KpiStat";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UnitFilter } from "@/components/UnitFilter";
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
    <header className="sticky top-0 z-30 border-b border-border bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-text text-[13px] font-black text-surface">
            RV
          </div>
          <div className="leading-tight">
            <div className="text-[14px] font-semibold text-text">Plataforma PCA</div>
            <div className="text-[11px] text-muted">Prefeitura de Rio Verde · GO</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Button href="/login">Entrar</Button>
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
      <div className="min-h-dvh bg-bg text-text">
        <Topo />
        <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <div className="mx-auto flex max-w-lg flex-col items-center justify-center rounded-card border border-dashed border-border-2 bg-surface px-6 py-16 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-card bg-surface-2 text-faint">
              <IconInbox className="h-8 w-8" />
            </div>
            <p className="mt-5 text-base font-bold text-text">Dados do PCA em breve</p>
            <p className="mt-2 text-sm text-muted">
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
    <div className="min-h-dvh bg-bg text-text">
      <Topo />
      <main className="mx-auto max-w-7xl space-y-[var(--gap-col)] px-4 py-6 sm:px-6">
        <div className="flex justify-end">
          <div className="w-full sm:w-80">
            <UnitFilter unidades={unidades} current={unidadeId} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-[var(--gap-block)] sm:grid-cols-2 xl:grid-cols-4">
          <KpiStat label="Total Planejado" value={brl(resumo.total)} hint={`em ${num(resumo.count)} itens`} />
          <KpiStat
            label="Qtd. de Itens"
            value={num(resumo.count)}
            cor="var(--sit-finalizado)"
            hint={unidadeId ? "itens na unidade" : `${num(resumo.numUnidades)} unidade(s)`}
          />
          <KpiStat label="Ticket Médio" value={brl(resumo.ticket)} cor="var(--sit-em-analise)" hint="por item" />
          <KpiStat
            label="Maior Item"
            value={brl(resumo.maiorValor)}
            cor="var(--sit-devolvido)"
            hint={resumo.maiorNome ?? "—"}
          />
        </div>

        <div className="grid grid-cols-1 gap-[var(--gap-block)] lg:grid-cols-2">
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
