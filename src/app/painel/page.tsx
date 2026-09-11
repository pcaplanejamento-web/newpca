import Link from "next/link";
import { ProtocoloCard } from "@/components/ProtocoloCard";
import { StatCard } from "@/components/StatCard";
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
import type { Tone } from "@/components/Badge";
import { getUsuarioAtual } from "@/lib/auth";
import {
  getResumoProtocolos,
  protocolosRecentes,
  situacaoLabel,
} from "@/lib/protocolos";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [u, resumo, recentes] = await Promise.all([
    getUsuarioAtual(),
    getResumoProtocolos(),
    protocolosRecentes(6),
  ]);
  const primeiroNome = u?.nome?.trim().split(/\s+/u)[0] ?? "";

  const stats: {
    href: string;
    label: string;
    value: number;
    tone: Tone;
    Icon: typeof IconFile;
  }[] = [
    { href: "/painel/protocolos", label: "Total", value: resumo.total, tone: "slate", Icon: IconFile },
    { href: "/painel/protocolos?situacao=em_analise", label: "Em análise", value: resumo.emAnalise, tone: "amber", Icon: IconClock },
    { href: "/painel/protocolos?situacao=em_andamento", label: "Em andamento", value: resumo.emAndamento, tone: "blue", Icon: IconActivity },
    { href: "/painel/protocolos?situacao=finalizado", label: "Finalizados", value: resumo.finalizado, tone: "emerald", Icon: IconCheck },
    { href: "/painel/protocolos?situacao=devolvido", label: "Devolvidos", value: resumo.devolvido, tone: "orange", Icon: IconAlert },
  ];

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">
            {primeiroNome ? `Olá, ${primeiroNome}` : "Dashboard"}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Visão geral dos protocolos do PCA.
          </p>
        </div>
        <Link
          href="/painel/protocolos"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          <IconPlus className="h-[18px] w-[18px]" /> Novo protocolo
        </Link>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="block">
            <StatCard
              label={s.label}
              value={s.value}
              tone={s.tone}
              icon={<s.Icon className="h-5 w-5" />}
            />
          </Link>
        ))}
      </div>

      {/* Protocolos recentes */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
            Protocolos recentes
          </h3>
          <Link
            href="/painel/protocolos"
            className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 transition hover:text-emerald-700 dark:text-emerald-400"
          >
            Ver todos <IconChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {recentes.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
              <IconFile className="h-7 w-7" />
            </div>
            <p className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Nenhum protocolo cadastrado ainda
            </p>
            <Link
              href="/painel/protocolos"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              <IconPlus className="h-[18px] w-[18px]" /> Cadastrar protocolo
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {recentes.map((p) => (
              <ProtocoloCard key={p.id} p={p} situacaoLabel={situacaoLabel(p.situacao)} />
            ))}
          </div>
        )}
      </section>

      {/* Atalho para ferramentas */}
      <Link
        href="/painel/ferramentas"
        className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
          <IconTool className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-slate-800 dark:text-white">Ferramentas</h3>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Dashboard do PCA, tabelas dinâmicas e importação de planilhas.
          </p>
        </div>
        <IconChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 dark:text-slate-600" />
      </Link>
    </div>
  );
}
