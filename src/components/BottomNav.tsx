"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconActivity, IconDashboard, IconFile, IconUser } from "./icons";

const ITENS = [
  { href: "/painel", label: "Painel", Icon: IconDashboard, exact: true },
  { href: "/painel/protocolos", label: "Protocolos", Icon: IconFile },
  { href: "/painel/atividades", label: "Atividades", Icon: IconActivity },
  { href: "/painel/perfil", label: "Perfil", Icon: IconUser },
] as const;

/** Barra de navegação inferior (mobile). No desktop usa-se a sidebar. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {ITENS.map(({ href, label, Icon, exact }) => {
          const active = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                active
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              }`}
            >
              <Icon className="h-[22px] w-[22px]" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
