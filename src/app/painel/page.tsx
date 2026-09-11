import Link from "next/link";
import type { Tone } from "@/components/Badge";
import { Button } from "@/components/Button";
import {
  IconActivity,
  IconAlert,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconFile,
  IconPlus,
  IconTool,
} from "@/components/icons";
import { ProtocoloCard } from "@/components/ProtocoloCard";
import { StatCard } from "@/components/StatCard";
import { getResumoProtocolos, protocolosRecentes, situacaoLabel } from "@/lib/protocolos";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [resumo, recentes] = await Promise.all([getResumoProtocolos(), protocolosRecentes(6)]);

  const stats: { href: string; label: string; value: number; tone: Tone; Icon: typeof IconFile }[] = [
    { href: "/painel/protocolos", label: "Total", value: resumo.total, tone: "slate", Icon: IconFile },
    { href: "/painel/protocolos?situacao=em_analise", label: "Em análise", value: resumo.emAnalise, tone: "amber", Icon: IconClock },
    { href: "/painel/protocolos?situacao=em_andamento", label: "Em andamento", value: resumo.emAndamento, tone: "blue", Icon: IconActivity },
    { href: "/painel/protocolos?situacao=finalizado", label: "Finalizados", value: resumo.finalizado, tone: "emerald", Icon: IconCheck },
    { href: "/painel/protocolos?situacao=devolvido", label: "Devolvidos", value: resumo.devolvido, tone: "orange", Icon: IconAlert },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button href="/painel/protocolos" icon={<IconPlus className="h-[18px] w-[18px]" />}>
          Novo protocolo
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="block">
            <StatCard label={s.label} value={s.value} tone={s.tone} icon={<s.Icon className="h-5 w-5" />} />
          </Link>
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-text">Protocolos recentes</h3>
          <Link
            href="/painel/protocolos"
            className="inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:opacity-80"
          >
            Ver todos <IconChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {recentes.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border-2 bg-surface px-6 py-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-card bg-surface-2 text-faint">
              <IconFile className="h-7 w-7" />
            </div>
            <p className="mt-4 text-sm font-semibold text-text">Nenhum protocolo cadastrado ainda</p>
            <Button href="/painel/protocolos" icon={<IconPlus className="h-[18px] w-[18px]" />} className="mt-4">
              Cadastrar protocolo
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {recentes.map((p) => (
              <ProtocoloCard key={p.id} p={p} situacaoLabel={situacaoLabel(p.situacao)} />
            ))}
          </div>
        )}
      </section>

      <Link
        href="/painel/ferramentas"
        className="group flex items-center gap-4 rounded-card border border-border bg-surface p-5 shadow-ring transition-colors hover:border-border-2"
      >
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-control bg-accent text-surface">
          <IconTool className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-text">Ferramentas</h3>
          <p className="mt-0.5 text-sm text-muted">
            Dashboard do PCA, tabelas dinâmicas e importação de planilhas.
          </p>
        </div>
        <IconChevronRight className="h-5 w-5 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
