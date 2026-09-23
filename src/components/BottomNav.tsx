"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBox, IconClipboard, IconDashboard, IconFile, IconUser } from "./icons";

type ItemNav = { href: string; label: string; Icon: typeof IconDashboard; exact?: boolean; /** Aba de módulo exigida (permissão). */ aba?: string };

const ITENS: ItemNav[] = [
  { href: "/painel", label: "Painel", Icon: IconDashboard, exact: true, aba: "dashboard" },
  { href: "/painel/protocolos", label: "Protocolos", Icon: IconFile, aba: "protocolos" },
  { href: "/painel/mesa", label: "Mesa", Icon: IconClipboard, aba: "dfd" },
  { href: "/painel/pca", label: "PCA", Icon: IconBox, aba: "pca" },
  { href: "/painel/perfil", label: "Perfil", Icon: IconUser },
];

/** Barra de navegação inferior (mobile). No desktop usa-se a sidebar. Mostra só as abas que o grupo ativo
 * pode ver (a MESMA permissão da sidebar — o admin vê todas); o Perfil é sempre visível. */
export function BottomNav({ abas }: { abas: Set<string> }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {ITENS.filter((i) => !i.aba || abas.has(i.aba)).map(({ href, label, Icon, exact }) => {
          const active = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "text-accent" : "text-faint hover:text-text-2"
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
