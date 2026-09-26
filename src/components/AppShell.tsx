"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { Avatar } from "./Avatar";
import { BottomNav } from "./BottomNav";
import { Dropdown } from "./Dropdown";
import { NAV_MODULOS } from "./navModulos";
import { SinoNotificacoes } from "./SinoNotificacoes";
import { ThemeToggle } from "./ThemeToggle";
import { toast } from "./Toast";
import {
  IconBox,
  IconBuilding,
  IconLandmark,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconClose,
  IconDatabase,
  IconLogout,
  IconMenu,
  IconPalette,
  IconPlug,
  IconSettings,
  IconShield,
  IconSpinner,
  IconUser,
  IconUsers,
} from "./icons";
import type { UsuarioSessao } from "@/lib/auth";
import { nomeExibicao } from "@/lib/pessoa";

type Role = UsuarioSessao["role"];

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  membro: "Membro",
};

type NavItem = {
  href: string;
  label: string;
  Icon: typeof IconSettings;
  roles?: Role[];
  /** Chave de aba gerenciável por permissão (só nos módulos). */
  aba?: string;
};
type NavSecao = { titulo: string; itens: NavItem[] };

const SECOES: NavSecao[] = [
  // Os protocolos, DFDs e itens vivem na MESA (o antigo Dashboard e a tela Protocolos legada saíram).
  { titulo: "Módulos", itens: NAV_MODULOS },
  {
    titulo: "Administração",
    itens: [
      { href: "/painel/configuracoes", label: "Configurações", Icon: IconSettings, roles: ["admin"] },
      { href: "/painel/usuarios", label: "Usuários", Icon: IconUser, roles: ["admin"] },
      { href: "/painel/grupos", label: "Grupos", Icon: IconUsers, roles: ["admin"] },
      { href: "/painel/orgaos", label: "Órgãos e Unidades", Icon: IconLandmark, roles: ["admin"] },
      { href: "/painel/permissoes", label: "Permissões", Icon: IconShield, roles: ["admin"] },
      { href: "/painel/integracoes", label: "Integrações", Icon: IconPlug, roles: ["admin"] },
      { href: "/painel/armazenamento", label: "Armazenamento", Icon: IconDatabase, roles: ["admin"] },
      { href: "/painel/auditoria", label: "Auditoria", Icon: IconClock, roles: ["admin"] },
      { href: "/painel/aparencia", label: "Aparência", Icon: IconPalette, roles: ["admin"] },
    ],
  },
];

/** Seções/itens visíveis para o papel + permissão de abas do grupo ativo. */
function secoesVisiveis(role: Role, abas: Set<string>): NavSecao[] {
  return SECOES.map((s) => ({
    ...s,
    itens: s.itens.filter(
      (i) => (!i.roles || i.roles.includes(role)) && (!i.aba || abas.has(i.aba)),
    ),
  })).filter((s) => s.itens.length > 0);
}

function itemAtivo(pathname: string, item: NavItem): boolean {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Identidade do site definida pelo ADM (Configurações → Identidade). */
type Identidade = { nome?: string; subtitulo?: string; favicon?: string };

function Brand({ compact = false, identidade }: { compact?: boolean; identidade?: Identidade }) {
  const nome = identidade?.nome?.trim() || "Plataforma PCA";
  const subtitulo = identidade?.subtitulo?.trim() || "Equipe PCA · Rio Verde";
  const favicon = identidade?.favicon?.trim();
  return (
    <Link href="/painel" className="flex items-center gap-2.5">
      {favicon ? (
        // biome-ignore lint/performance/noImgElement: favicon é data-URL base64 definida pelo ADM; next/image não otimiza data-URL.
        <img
          src={favicon}
          alt=""
          className="h-9 w-9 shrink-0 rounded-[10px] object-cover"
        />
      ) : (
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-text text-[13px] font-black text-surface">
          RV
        </div>
      )}
      {!compact && (
        <div className="leading-tight">
          <div className="text-[14px] font-semibold text-text">{nome}</div>
          <div className="text-[11px] text-muted">{subtitulo}</div>
        </div>
      )}
    </Link>
  );
}

function NavLinks({
  role,
  abas,
  onNavigate,
}: {
  role: Role;
  abas: Set<string>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-4">
      {secoesVisiveis(role, abas).map((secao) => (
        <div key={secao.titulo}>
          <p className="mb-1.5 px-2 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-faint">
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
                  className={`flex items-center gap-[11px] rounded-chip border px-2 py-2 text-[13.5px] transition-colors duration-[var(--motion-duration)] ${
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
          {/* O APELIDO (nome de exibição) — o nome completo no title. */}
          <div className="truncate text-sm font-semibold text-text" title={usuario.nome}>
            {nomeExibicao(usuario)}
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

type GrupoNav = { id: number; nome: string };

/** Seletor de grupo ativo no cabeçalho. Troca o grupo (cookie) e recarrega. */
function GrupoSelect({ grupos, ativoId }: { grupos: GrupoNav[]; ativoId: number | null }) {
  const router = useRouter();
  const [trocando, setTrocando] = useState(false);
  if (grupos.length === 0) return null;
  const ativo = grupos.find((g) => g.id === ativoId) ?? grupos[0];

  async function trocar(id: number, close: () => void) {
    close();
    if (id === ativo.id) return;
    setTrocando(true);
    try {
      await fetch("/api/grupos/ativo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grupoId: id }),
      });
      router.refresh();
    } finally {
      setTrocando(false);
    }
  }

  return (
    <Dropdown
      align="start"
      ariaLabel={`Grupo ativo: ${ativo.nome}`}
      triggerClassName="gap-1.5 rounded-chip border border-border-2 bg-surface px-3 h-11 text-[13px] font-medium text-text-2 hover:bg-surface-2 disabled:opacity-60 lg:h-[var(--h-control-sm)]"
      width={220}
      trigger={
        <>
          {trocando ? (
            <IconSpinner className="h-3.5 w-3.5" />
          ) : (
            <IconUsers className="h-3.5 w-3.5 opacity-70" />
          )}
          <span className="max-w-[9rem] truncate">{ativo.nome}</span>
          <IconChevronDown className="h-3.5 w-3.5 opacity-60" />
        </>
      }
    >
      {(close) => (
        <div className="p-1">
          {grupos.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => trocar(g.id, close)}
              className={`flex min-h-11 w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-[13px] lg:min-h-0 ${
                g.id === ativo.id ? "bg-accent-soft font-semibold text-accent" : "text-text-2 hover:bg-surface-2"
              }`}
            >
              <IconUsers className="h-4 w-4 shrink-0 opacity-70" />
              <span className="min-w-0 truncate">{g.nome}</span>
              {g.id === ativo.id && <IconCheck className="ml-auto h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  );
}

type PcaNav = { id: number; nome: string; ano: number };

/**
 * PCA do CABEÇALHO — o filtro GLOBAL (cookie, como a unidade e o grupo): a Mesa, os cards do módulo PCA e o Orçamento
 * mostram só o PCA escolhido; "Todos os PCAs" = sem filtro. Dentro do espaço de um PCA, escolher outro leva ao espaço
 * dele (na mesma aba). No celular o gatilho mostra só o ANO (o nome inteiro na lista).
 */
function PcaSelect({ pcas, ativoId }: { pcas: PcaNav[]; ativoId: number | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [trocando, setTrocando] = useState(false);
  // A escolha vale NA HORA pelo estado local: o layout é COMPARTILHADO — ir de um espaço de PCA a outro (push) não o
  // renderiza de novo, e o `ativoId` do servidor ficaria o antigo (a marca no PCA errado e o clique de volta sem efeito).
  // Quando o servidor manda outro valor (refresh), ele vale.
  const [sel, setSel] = useState(ativoId);
  const [doServidor, setDoServidor] = useState(ativoId);
  if (doServidor !== ativoId) {
    setDoServidor(ativoId);
    setSel(ativoId);
  }
  if (pcas.length === 0) return null;
  const ativo = pcas.find((p) => p.id === sel) ?? null;

  async function trocar(id: number | null, close: () => void) {
    close();
    if (id === (ativo?.id ?? null)) return;
    setTrocando(true);
    try {
      const res = await fetch("/api/pca/filtro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pcaId: id }),
      });
      if (!res.ok) throw new Error();
      setSel(id);
      if (id != null && /^\/painel\/pca\/\d+/.test(pathname)) router.push(`/painel/pca/${id}${window.location.search}`);
      else router.refresh();
    } catch {
      toast.error("Não foi possível trocar o PCA — tente de novo.");
    } finally {
      setTrocando(false);
    }
  }

  const opcao = (marcado: boolean) =>
    `flex min-h-11 w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-[13px] lg:min-h-0 ${
      marcado ? "bg-accent-soft font-semibold text-accent" : "text-text-2 hover:bg-surface-2"
    }`;
  return (
    <Dropdown
      align="start"
      ariaLabel={`PCA do cabeçalho: ${ativo ? `${ativo.nome} (${ativo.ano})` : "todos os PCAs"} — filtra todo o sistema`}
      triggerClassName={`gap-1 rounded-chip border px-2 h-11 min-w-11 justify-center text-[13px] font-medium sm:gap-1.5 sm:px-3 lg:h-[var(--h-control-sm)] ${
        ativo ? "border-accent/50 bg-accent-soft text-accent" : "border-border-2 bg-surface text-text-2 hover:bg-surface-2"
      }`}
      width={260}
      trigger={
        <>
          {trocando ? <IconSpinner className="h-3.5 w-3.5 shrink-0" /> : <IconBox className="h-3.5 w-3.5 shrink-0 opacity-70" />}
          <span className="truncate sm:hidden">{ativo ? ativo.ano : "Todos"}</span>
          <span className="hidden max-w-[12rem] truncate sm:inline">{ativo ? ativo.nome : "Todos os PCAs"}</span>
          <IconChevronDown className="hidden h-3.5 w-3.5 shrink-0 opacity-60 sm:block" />
        </>
      }
    >
      {(close) => (
        <div className="max-h-[min(60vh,380px)] overflow-y-auto p-1">
          <button type="button" onClick={() => trocar(null, close)} className={opcao(ativo == null)}>
            <IconBox className="h-4 w-4 shrink-0 opacity-70" />
            <span className="min-w-0 truncate">Todos os PCAs</span>
            {ativo == null && <IconCheck className="ml-auto h-4 w-4 shrink-0" />}
          </button>
          {pcas.map((p) => (
            <button key={p.id} type="button" onClick={() => trocar(p.id, close)} className={opcao(p.id === ativo?.id)}>
              <span className="shrink-0 font-mono text-[10.5px] text-faint">{p.ano}</span>
              <span className="min-w-0 truncate">{p.nome}</span>
              {p.id === ativo?.id && <IconCheck className="ml-auto h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  );
}

type ReparticaoNav = { id: number; codigo: string; nome: string };

/** Seletor de repartição ativa no cabeçalho (entre as do grupo ativo). */
function ReparticaoSelect({ reparticoes, ativaId }: { reparticoes: ReparticaoNav[]; ativaId: number | null }) {
  const router = useRouter();
  const [trocando, setTrocando] = useState(false);
  if (reparticoes.length === 0) return null;
  const ativa = reparticoes.find((r) => r.id === ativaId) ?? reparticoes[0];

  async function trocar(id: number, close: () => void) {
    close();
    if (id === ativa.id) return;
    setTrocando(true);
    try {
      await fetch("/api/reparticoes/ativo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reparticaoId: id }),
      });
      router.refresh();
    } finally {
      setTrocando(false);
    }
  }

  return (
    <Dropdown
      align="start"
      ariaLabel={`Unidade ativa: ${ativa.nome}`}
      triggerClassName="gap-1.5 rounded-chip border border-border-2 bg-surface px-3 h-11 text-[13px] font-medium text-text-2 hover:bg-surface-2 lg:h-[var(--h-control-sm)]"
      width={260}
      trigger={
        <>
          {trocando ? (
            <IconSpinner className="h-3.5 w-3.5" />
          ) : (
            <IconBuilding className="h-3.5 w-3.5 opacity-70" />
          )}
          <span className="max-w-[9rem] truncate">{ativa.nome}</span>
          <IconChevronDown className="h-3.5 w-3.5 opacity-60" />
        </>
      }
    >
      {(close) => (
        <div className="max-h-[min(60vh,380px)] overflow-y-auto p-1">
          {reparticoes.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => trocar(r.id, close)}
              className={`flex min-h-11 w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-[13px] lg:min-h-0 ${
                r.id === ativa.id ? "bg-accent-soft font-semibold text-accent" : "text-text-2 hover:bg-surface-2"
              }`}
            >
              <span className="shrink-0 font-mono text-[10.5px] text-faint">{r.codigo}</span>
              <span className="min-w-0 truncate">{r.nome}</span>
              {r.id === ativa.id && <IconCheck className="ml-auto h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  );
}

export function AppShell({
  children,
  usuario,
  grupos,
  grupoAtivoId,
  abas,
  reparticoes,
  reparticaoAtivaId,
  pcas = [],
  pcaFiltroId = null,
  identidade,
  notificacoes = 0,
}: {
  children: ReactNode;
  usuario: UsuarioSessao;
  grupos: GrupoNav[];
  grupoAtivoId: number | null;
  abas: string[];
  reparticoes: ReparticaoNav[];
  reparticaoAtivaId: number | null;
  /** PCAs do seletor do cabeçalho (filtro global) e o escolhido (`null` = todos). */
  pcas?: PcaNav[];
  pcaFiltroId?: number | null;
  identidade?: Identidade;
  /** Notificações NÃO LIDAS (o número do sino). */
  notificacoes?: number;
}) {
  const [menuAberto, setMenuAberto] = useState(false);
  const fecharMenu = () => setMenuAberto(false);
  const abasSet = new Set(abas);
  // O PCA do cabeçalho filtra a Mesa, o módulo PCA e o Orçamento — sem nenhuma dessas abas, o seletor não aparece.
  const filtraPca = abasSet.has("dfd") || abasSet.has("pca") || abasSet.has("orcamento");

  return (
    <div className="min-h-dvh bg-bg text-text lg:flex">
      {/* Sidebar desktop — fixa (sticky), altura do display, com scroll interno na navegação */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface lg:flex lg:sticky lg:top-0 lg:h-dvh print:!hidden">
        {/* Faixa da marca na ALTURA do cabeçalho (a borda de baixo continua a dele) */}
        <div className="flex h-[var(--h-header)] shrink-0 items-center border-b border-border px-4">
          <Brand identidade={identidade} />
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-4">
          <NavLinks role={usuario.role} abas={abasSet} />
        </div>
        <div className="p-2 pt-0">
          <UserMenu usuario={usuario} />
        </div>
      </aside>

      {/* Drawer mobile (menu hambúrguer) — reusa a mesma navegação da sidebar */}
      {menuAberto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm" onClick={fecharMenu} />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[82%] animate-fade-in-up flex-col bg-surface shadow-soft">
            <div className="flex h-[var(--h-header)] shrink-0 items-center justify-between border-b border-border pl-4 pr-1">
              <Brand identidade={identidade} />
              <button
                type="button"
                aria-label="Fechar menu"
                onClick={fecharMenu}
                className="inline-flex h-11 w-11 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-2"
              >
                <IconClose className="h-5 w-5" />
              </button>
            </div>
            {(reparticoes.length > 0 || grupos.length > 0) && (
              <div className="flex flex-wrap gap-2 px-4 pt-3 sm:hidden">
                <ReparticaoSelect reparticoes={reparticoes} ativaId={reparticaoAtivaId} />
                <GrupoSelect grupos={grupos} ativoId={grupoAtivoId} />
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-2 py-4">
              <NavLinks role={usuario.role} abas={abasSet} onNavigate={fecharMenu} />
            </div>
            <div className="p-2 pt-0 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))]">
              <UserMenu usuario={usuario} onNavigate={fecharMenu} />
            </div>
          </aside>
        </div>
      )}

      {/* Coluna principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[var(--h-header)] items-center gap-2 border-b border-border bg-surface/85 px-[var(--pad-canvas)] backdrop-blur-md print:hidden">
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setMenuAberto(true)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-text-2 transition-colors hover:bg-surface-2 lg:hidden"
          >
            <IconMenu className="h-5 w-5" />
          </button>
          <div className="shrink-0 lg:hidden">
            <Brand compact identidade={identidade} />
          </div>
          {/* PCA do cabeçalho (filtro de todo o sistema) — à ESQUERDA; só para quem vê o que ele filtra (Mesa, PCA,
              Orçamento). É o único item que ENCOLHE numa tela estreita (o rótulo trunca) — os demais mantêm os 44px. */}
          {filtraPca && (
            <div className="min-w-0">
              <PcaSelect pcas={pcas} ativoId={pcaFiltroId} />
            </div>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <div className="hidden items-center gap-1.5 sm:flex">
              <ReparticaoSelect reparticoes={reparticoes} ativaId={reparticaoAtivaId} />
              <GrupoSelect grupos={grupos} ativoId={grupoAtivoId} />
            </div>
            <SinoNotificacoes naoLidas={notificacoes} />
            <ThemeToggle />
            <Link href="/painel/perfil" aria-label="Meu perfil" className="inline-flex h-11 w-11 items-center justify-center rounded-control lg:hidden">
              <Avatar nome={usuario.nome} foto={usuario.foto} size="sm" />
            </Link>
          </div>
        </header>

        {/* A MESMA margem (--pad-canvas) do cabeçalho, do menu e da borda do display; no celular, a base soma a
            navegação inferior (4rem + área segura). */}
        <main className="flex-1 p-[var(--pad-canvas)] pb-[calc(var(--pad-canvas)_+_4rem_+_env(safe-area-inset-bottom))] lg:pb-[var(--pad-canvas)]">
          {children}
        </main>
      </div>

      {/* Navegação inferior (mobile) */}
      <BottomNav abas={abasSet} />
    </div>
  );
}
