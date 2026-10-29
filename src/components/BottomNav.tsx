"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { IconeNavegacao } from "./CarregandoLink";
import { usePathname } from "next/navigation";
import { IconUser } from "./icons";
import { NAV_MODULOS } from "./navModulos";

const PERFIL = { href: "/painel/perfil", label: "Perfil", Icon: IconUser };
const POR_ABA = new Map(NAV_MODULOS.map((m) => [m.aba as string, m]));

/** Barra de navegação inferior (mobile). No desktop usa-se a sidebar. As MESMAS telas do menu, na ordem dos MÓDULOS
 * (Configurações → Módulos) — o servidor já filtrou as abertas; o Perfil é sempre visível. */
export function BottomNav({ telas }: { telas: readonly string[] }) {
  const pathname = usePathname();
  const itens = [...telas.flatMap((t) => POR_ABA.get(t) ?? []), PERFIL];
  // Muitas telas: a barra ROLA de lado (cada item com a largura mínima do rótulo — nada cortado) e a tela aberta fica à vista.
  const ativo = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (pathname) ativo.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden">
      <div className="mx-auto flex max-w-md items-stretch justify-around overflow-x-auto overscroll-x-contain">
        {itens.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              ref={active ? ativo : undefined}
              unstable_dynamicOnHover
              className={`flex min-h-[44px] min-w-[4.25rem] flex-1 flex-col items-center gap-1 px-0.5 py-2.5 text-[11px] font-medium transition-colors max-[400px]:text-[10px] ${
                active ? "text-accent" : "text-faint hover:text-text-2"
              }`}
            >
              <IconeNavegacao Icon={Icon} className="h-[22px] w-[22px] shrink-0" />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
