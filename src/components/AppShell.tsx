"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";
import {
  IconClose,
  IconDashboard,
  IconLogout,
  IconMenu,
  IconSpinner,
  IconUpload,
  IconUsers,
} from "./icons";
import type { UsuarioSessao } from "@/lib/auth";

const ROLE_LABEL: Record<UsuarioSessao["role"], string> = {
  admin: "Administrador",
  gestor: "Gestor",
  membro: "Membro",
};

type NavItem = { href: string; label: string; Icon: typeof IconDashboard };

function navItens(role: UsuarioSessao["role"]): NavItem[] {
  const itens: NavItem[] = [
    { href: "/painel", label: "Indicadores", Icon: IconDashboard },
    { href: "/painel/upload", label: "Importar Planilha", Icon: IconUpload },
  ];
  if (role === "admin")
    itens.push({ href: "/painel/usuarios", label: "Usuários", Icon: IconUsers });
  return itens;
}

function Brand() {
  return (
    <Link href="/painel" className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-700 text-sm font-black text-white shadow-sm">
        RV
      </div>
      <div className="leading-tight">
        <div className="text-sm font-bold text-slate-900 dark:text-white">
          PCA 2026
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400">
          Prefeitura de Rio Verde
        </div>
      </div>
    </Link>
  );
}

function NavLinks({
  role,
  onNavigate,
}: {
  role: UsuarioSessao["role"];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {navItens(role).map(({ href, label, Icon }) => {
        const active =
          href === "/painel" ? pathname === "/painel" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            }`}
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu({ usuario }: { usuario: UsuarioSessao }) {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignora */
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          {usuario.nome.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div
            className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100"
            title={usuario.nome}
          >
            {usuario.nome}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {ROLE_LABEL[usuario.role]}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={sair}
        disabled={saindo}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        {saindo ? (
          <IconSpinner className="h-4 w-4" />
        ) : (
          <IconLogout className="h-4 w-4" />
        )}
        Sair
      </button>
    </div>
  );
}

export function AppShell({
  children,
  usuario,
}: {
  children: ReactNode;
  usuario: UsuarioSessao;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="px-1">
          <Brand />
        </div>
        <div className="mt-7 px-1">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Navegação
          </p>
          <NavLinks role={usuario.role} />
        </div>
        <div className="mt-auto pt-6">
          <UserMenu usuario={usuario} />
        </div>
      </aside>

      {/* Drawer mobile */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[80%] flex-col bg-white px-4 py-5 shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between px-1">
              <Brand />
              <button
                type="button"
                aria-label="Fechar menu"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <IconClose className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-7 px-1">
              <NavLinks role={usuario.role} onNavigate={() => setOpen(false)} />
            </div>
            <div className="mt-auto pt-6">
              <UserMenu usuario={usuario} />
            </div>
          </aside>
        </div>
      )}

      {/* Coluna principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md sm:px-6 dark:border-slate-800 dark:bg-slate-900/80">
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <IconMenu className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-slate-900 sm:text-lg dark:text-white">
              Área da Equipe
            </h1>
            <p className="hidden truncate text-xs text-slate-500 sm:block dark:text-slate-400">
              Planejamento de Contratações Anuais
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/painel/upload"
              className="hidden items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 sm:inline-flex"
            >
              <IconUpload className="h-[18px] w-[18px]" />
              Importar
            </Link>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
