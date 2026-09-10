import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IconBox, IconDashboard, IconTrend, IconUpload } from "@/components/icons";

export const metadata = {
  title: "PCA — Prefeitura de Rio Verde",
};

const RECURSOS = [
  {
    Icon: IconDashboard,
    titulo: "Indicadores",
    texto: "Painéis com KPIs, gráficos e consulta detalhada das contratações.",
  },
  {
    Icon: IconUpload,
    titulo: "Importação de planilhas",
    texto: "Suba o PCA em .xlsx e veja os dados normalizados na hora.",
  },
  {
    Icon: IconBox,
    titulo: "Gestão de protocolos",
    texto: "Acompanhamento de protocolos e fluxos da equipe (em construção).",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      {/* Topo */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-700 text-sm font-black text-white">
            RV
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold">PCA — Rio Verde</div>
            <div className="hidden text-[11px] text-slate-500 sm:block dark:text-slate-400">
              Planejamento de Contratações Anuais
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/login"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Entrar
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              <IconTrend className="h-4 w-4" />
              Plataforma interna
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">
              Plano de Contratações Anual da{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                Prefeitura de Rio Verde
              </span>
            </h1>
            <p className="mt-4 text-base text-slate-600 sm:text-lg dark:text-slate-300">
              Centralize o planejamento, a importação de planilhas e o
              acompanhamento das contratações da equipe em um só lugar.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Entrar na área da equipe
              </Link>
              <Link
                href="/cadastro"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Solicitar cadastro
              </Link>
            </div>
          </div>

          {/* Recursos */}
          <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {RECURSOS.map(({ Icon, titulo, texto }) => (
              <div
                key={titulo}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-semibold">{titulo}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {texto}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400 dark:border-slate-800">
        Prefeitura Municipal de Rio Verde · PCA · uso interno
      </footer>
    </div>
  );
}
