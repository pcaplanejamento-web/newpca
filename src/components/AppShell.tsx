"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Avatar } from "./Avatar";
import { BottomNav } from "./BottomNav";
import { ThemeToggle } from "./ThemeToggle";
import {
  IconActivity,
  IconBell,
  IconClipboard,
  IconClock,
  IconClose,
  IconDashboard,
  IconFile,
  IconLogout,
  IconMenu,
  IconSearch,
  IconShield,
  IconSpinner,
  IconTool,
  IconUser,
  IconUsers,
} from "./icons";
import type { UsuarioSessao } from "@/lib/auth";

type Role = UsuarioSessao["role"];

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  membro: "Membro",
};

type NavItem = {
  href: string;
  label: string;
  Icon: typeof IconDashboard;
  roles?: Role[];
  exact?: boolean;
};
type NavSecao = { titulo: string; itens: NavItem[] };

const SECOES: NavSecao[] = [
  {
    titulo: "Ferramentas",
    itens: [
      { href: "/painel", label: "Dashboard", Icon: IconDashboard, exact: true },
      { href: "/painel/protocolos", label: "Protocolos", Icon: IconFile },
      { href: "/painel/atividades", label: "Atividades", Icon: IconActivity },
      { href: "/painel/pendencias", label: "Pendências", Icon: IconClock },
      { href: "/painel/ferramentas", label: "Ferramentas", Icon: IconTool },
    ],
  },
  {
    titulo: "Administração",
    itens: [
      { href: "/painel/usuarios", label: "Usuários", Icon: IconUser, roles: ["admin"] },
      {
        href: "/painel/equipes",
        label: "Equipes",
        Icon: IconUsers,
        roles: ["admin", "gestor"],
      },
      {
        href: "/painel/permissoes",
        label: "Permissões",
        Icon: IconShield,
        roles: ["admin"],
      },
      {
        href: "/painel/auditoria",
        label: "Auditoria",
        Icon: IconClipboard,
        roles: ["admin"],
      },
    ],
  },
];

/** Seções/itens visíveis para o papel dado. */
function secoesVisiveis(role: Role): NavSecao[] {
  return SECOES.map((s) => ({
    ...s,
    itens: s.itens.filter((i) => !i.roles || i.roles.includes(role)),
  })).filter((s) => s.itens.length > 0);
}

function itemAtivo(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/painel" className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-700 text-sm font-black text-white shadow-sm">
        RV
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="text-sm font-bold text-slate-900 dark:text-white">
            Plataforma PCA
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Equipe PCA · Rio Verde
          </div>
        </div>
      )}
    </Link>
  );
}

function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-5">
      {secoesVisiveis(role).map((secao) => (
        <div key={secao.titulo}>
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {secao.titulo}
          </p>
          <nav className="flex flex-col gap-1">
            {secao.itens.map((item) => {
              const active = itemAtivo(pathname, item);
              const { Icon } = item;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </div>
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
        <Avatar nome={usuario.nome} />
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
        {saindo ? <IconSpinner className="h-4 w-4" /> : <IconLogout className="h-4 w-4" />}
        Sair
      </button>
    </div>
  );
}

function BuscaGlobal({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const termo = q.trim();
        router.push(termo ? `/painel/protocolos?q=${encodeURIComponent(termo)}` : "/painel/protocolos");
      }}
      className={`relative ${className}`}
    >
      <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar protocolos..."
        aria-label="Buscar protocolos"
        className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:bg-slate-800 dark:focus:ring-emerald-500/20"
      />
    </form>
  );
}

function SinoNotificacoes() {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notificações"
        onClick={() => setAberto((v) => !v)}
        className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <IconBell className="h-5 w-5" />
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)} />
          <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-4 text-center shadow-lg dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Notificações
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Você está em dia. Nada por aqui ainda.
            </p>
          </div>
        </>
      )}
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
  const [menuAberto, setMenuAberto] = useState(false);
  const fecharMenu = () => setMenuAberto(false);

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="px-1">
          <Brand />
        </div>
        <div className="mt-7 flex-1 overflow-y-auto px-1">
          <NavLinks role={usuario.role} />
        </div>
        <div className="pt-6">
          <UserMenu usuario={usuario} />
        </div>
      </aside>

      {/* Drawer mobile (menu hambúrguer) — reusa a mesma navegação da sidebar */}
      {menuAberto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={fecharMenu} />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[82%] animate-fade-in-up flex-col bg-white px-4 py-5 shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between px-1">
              <Brand />
              <button
                type="button"
                aria-label="Fechar menu"
                onClick={fecharMenu}
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <IconClose className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-7 flex-1 overflow-y-auto px-1">
              <NavLinks role={usuario.role} onNavigate={fecharMenu} />
            </div>
            <div className="pt-6">
              <UserMenu usuario={usuario} />
            </div>
          </aside>
        </div>
      )}

      {/* Coluna principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md sm:px-6 dark:border-slate-800 dark:bg-slate-900/80">
          {/* Botão hambúrguer (mobile) */}
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setMenuAberto(true)}
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <IconMenu className="h-5 w-5" />
          </button>
          {/* Marca (mobile) — a sidebar some abaixo de lg */}
          <div className="lg:hidden">
            <Brand compact />
          </div>
          {/* Busca (desktop) */}
          <BuscaGlobal className="hidden w-full max-w-sm lg:block" />

          <div className="ml-auto flex items-center gap-1.5">
            <SinoNotificacoes />
            <ThemeToggle />
            <Link href="/painel/perfil" aria-label="Meu perfil" className="lg:hidden">
              <Avatar nome={usuario.nome} size="sm" />
            </Link>
          </div>
        </header>

        {/* Conteúdo — padding inferior no mobile para não ficar sob a bottom-nav */}
        <main className="flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-8">{children}</main>
      </div>

      {/* Navegação inferior (mobile) */}
      <BottomNav />
    </div>
  );
}
