"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { Avatar } from "./Avatar";
import { BottomNav } from "./BottomNav";
import { ThemeToggle } from "./ThemeToggle";
import {
  IconActivity,
  IconBell,
  IconBox,
  IconClipboard,
  IconClock,
  IconClose,
  IconDashboard,
  IconFile,
  IconLogout,
  IconMenu,
  IconPalette,
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
      { href: "/painel/pca", label: "PCA", Icon: IconBox },
      { href: "/painel/atividades", label: "Atividades", Icon: IconActivity },
      { href: "/painel/pendencias", label: "Pendências", Icon: IconClock },
      { href: "/painel/ferramentas", label: "Ferramentas", Icon: IconTool },
    ],
  },
  {
    titulo: "Administração",
    itens: [
      { href: "/painel/usuarios", label: "Usuários", Icon: IconUser, roles: ["admin"] },
      { href: "/painel/aparencia", label: "Aparência", Icon: IconPalette, roles: ["admin"] },
      { href: "/painel/equipes", label: "Equipes", Icon: IconUsers, roles: ["admin", "gestor"] },
      { href: "/painel/permissoes", label: "Permissões", Icon: IconShield, roles: ["admin"] },
      { href: "/painel/auditoria", label: "Auditoria", Icon: IconClipboard, roles: ["admin"] },
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
    <Link href="/painel" className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-text text-[13px] font-black text-surface">
        RV
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="text-[14px] font-semibold text-text">Plataforma PCA</div>
          <div className="text-[11px] text-muted">Equipe PCA · Rio Verde</div>
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
          <p className="mb-2 px-3 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-faint">
            {secao.titulo}
          </p>
          <nav className="flex flex-col gap-0.5">
            {secao.itens.map((item) => {
              const active = itemAtivo(pathname, item);
              const { Icon } = item;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-[11px] rounded-chip border px-3 py-2 text-[13.5px] transition-colors duration-[var(--motion-duration)] ${
                    active
                      ? "border-border-2 bg-sb-active font-semibold text-text"
                      : "border-transparent font-medium text-text-2 hover:bg-surface-2 hover:text-text"
                  }`}
                >
                  <Icon
                    className={`h-[17px] w-[17px] ${active ? "text-accent" : ""}`}
                    strokeWidth={1.8}
                  />
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

function UserMenu({ usuario, onNavigate }: { usuario: UsuarioSessao; onNavigate?: () => void }) {
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
    <div className="rounded-card border border-border p-3">
      <Link
        href="/painel/perfil"
        onClick={onNavigate}
        title="Meu perfil"
        className="-m-1 flex items-center gap-2 rounded-control p-1 transition-colors hover:bg-surface-2"
      >
        <Avatar nome={usuario.nome} foto={usuario.foto} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text" title={usuario.nome}>
            {usuario.nome}
          </div>
          <div className="text-[11px] text-muted">{ROLE_LABEL[usuario.role]}</div>
        </div>
      </Link>
      <button
        type="button"
        onClick={sair}
        disabled={saindo}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-control border border-border-2 px-3 py-2 text-xs font-semibold text-text-2 transition-colors hover:bg-surface-2 disabled:opacity-60"
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
      <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar protocolos..."
        aria-label="Buscar protocolos"
        className="w-full rounded-control border border-border-2 bg-surface-2 py-2 pl-9 pr-3 text-sm text-text-2 outline-none transition-colors placeholder:text-faint focus-visible:border-accent focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-accent/30"
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
        className="rounded-control p-2 text-muted transition-colors hover:bg-surface-2 hover:text-text-2"
      >
        <IconBell className="h-5 w-5" />
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)} />
          <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-card border border-border bg-surface p-4 text-center shadow-soft">
            <p className="text-sm font-semibold text-text">Notificações</p>
            <p className="mt-1 text-xs text-muted">Você está em dia. Nada por aqui ainda.</p>
          </div>
        </>
      )}
    </div>
  );
}

export function AppShell({ children, usuario }: { children: ReactNode; usuario: UsuarioSessao }) {
  const [menuAberto, setMenuAberto] = useState(false);
  const fecharMenu = () => setMenuAberto(false);

  return (
    <div className="min-h-dvh bg-bg text-text lg:flex">
      {/* Sidebar desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface px-4 py-5 lg:flex">
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
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[82%] animate-fade-in-up flex-col bg-surface px-4 py-5 shadow-soft">
            <div className="flex items-center justify-between px-1">
              <Brand />
              <button
                type="button"
                aria-label="Fechar menu"
                onClick={fecharMenu}
                className="rounded-control p-1.5 text-muted transition-colors hover:bg-surface-2"
              >
                <IconClose className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-7 flex-1 overflow-y-auto px-1">
              <NavLinks role={usuario.role} onNavigate={fecharMenu} />
            </div>
            <div className="pt-6">
              <UserMenu usuario={usuario} onNavigate={fecharMenu} />
            </div>
          </aside>
        </div>
      )}

      {/* Coluna principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-surface/85 px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setMenuAberto(true)}
            className="rounded-control p-2 text-text-2 transition-colors hover:bg-surface-2 lg:hidden"
          >
            <IconMenu className="h-5 w-5" />
          </button>
          <div className="lg:hidden">
            <Brand compact />
          </div>
          <BuscaGlobal className="hidden w-full max-w-sm lg:block" />

          <div className="ml-auto flex items-center gap-1.5">
            <SinoNotificacoes />
            <ThemeToggle />
            <Link href="/painel/perfil" aria-label="Meu perfil" className="lg:hidden">
              <Avatar nome={usuario.nome} foto={usuario.foto} size="sm" />
            </Link>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-8">{children}</main>
      </div>

      {/* Navegação inferior (mobile) */}
      <BottomNav />
    </div>
  );
}
