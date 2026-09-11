import Link from "next/link";
import { IconChevronRight, IconLayers } from "@/components/icons";

export const dynamic = "force-dynamic";

const FERRAMENTAS = [
  {
    href: "/painel/ferramentas/tabelas",
    titulo: "Tabelas dinâmicas",
    descricao: "Crie listas com colunas personalizáveis (texto, seleção, data, número).",
    Icon: IconLayers,
    tone: "from-emerald-500 to-green-600",
  },
];

export default function FerramentasPage() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {FERRAMENTAS.map(({ href, titulo, descricao, Icon, tone }) => (
        <Link
          key={href}
          href={href}
          className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
        >
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${tone}`}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-slate-800 dark:text-white">{titulo}</h3>
              <IconChevronRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 dark:text-slate-600" />
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{descricao}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
