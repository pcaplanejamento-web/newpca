"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconUser } from "./icons";
import { NAV_MODULOS } from "./navModulos";

type ItemNav = { href: string; label: string; Icon: typeof IconUser; /** Aba de módulo exigida (permissão). */ aba?: string };

// Os módulos (Mesa, PCA, Catálogo, Orçamento, Tarefas, Calendário — a MESMA fonte da sidebar) + o Perfil, sempre visível.
const ITENS: ItemNav[] = [...NAV_MODULOS, { href: "/painel/perfil", label: "Perfil", Icon: IconUser }];

/** Barra de navegação inferior (mobile). No desktop usa-se a sidebar. Mostra só as abas que o grupo ativo
 * pode ver (a MESMA permissão da sidebar — o admin vê todas); o Perfil é sempre visível. */
export function BottomNav({ abas }: { abas: Set<string> }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden print:hidden">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {ITENS.filter((i) => !i.aba || abas.has(i.aba)).map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex min-h-[44px] min-w-0 flex-1 flex-col items-center gap-1 px-0.5 py-2.5 text-[11px] font-medium transition-colors max-[400px]:text-[10px] ${
                active ? "text-accent" : "text-faint hover:text-text-2"
              }`}
            >
              <Icon className="h-[22px] w-[22px] shrink-0" />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
