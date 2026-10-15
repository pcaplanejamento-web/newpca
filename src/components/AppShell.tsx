"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { BottomNav } from "./BottomNav";
import { Dropdown } from "./Dropdown";
import { type Identidade, MarcaSistema } from "./MarcaSistema";
import { NAV_MODULOS } from "./navModulos";
import { AcessoNovidades, VersaoSistema } from "./Novidades";
import { SincronizarDados } from "./SincronizarDados";
import { SetaDropdown } from "./SetaDropdown";
import { CanalGrupo, type PresencaShell } from "./CanalGrupo";
import { PresencaGrupo } from "./PresencaGrupo";
import { ChatAoVivo } from "./ChatAoVivo";
import type { ConfigChat } from "@/lib/chat-core";
import { SinoNotificacoes } from "./SinoNotificacoes";
import { ThemeToggle } from "./ThemeToggle";
import { toast } from "./Toast";
import {
  IconBox,
  IconBuilding,
  IconLandmark,
  IconCheck,
  IconClock,
  IconClose,
  IconDatabase,
  IconLogout,
  IconMenu,
  IconLayers,
  IconPalette,
  IconPlug,
  IconRecolherMenu,
  IconRobo,
  IconSettings,
  IconSpinner,
  IconUser,
  IconUsers,
} from "./icons";
import type { UsuarioSessao } from "@/lib/auth";
import { nomeExibicao } from "@/lib/pessoa";
import { ATRIBUTO_MENU, CHAVE_MENU } from "@/lib/menu-lateral";

type NavItem = {
  href: string;
  label: string;
  Icon: typeof IconSettings;
};
type NavSecao = { chave: string; titulo: string; itens: NavItem[] };

/** Uma seção do menu por MÓDULO (Configurações → Módulos) — o servidor já filtrou as telas abertas. */
export type SecaoModulo = { id: string; nome: string; telas: string[] };

/** A Administração — só o papel Administrador. */
const ADMINISTRACAO: NavSecao = {
    chave: "_admin",
    titulo: "Administração",
    itens: [
      { href: "/painel/configuracoes", label: "Configurações", Icon: IconSettings },
      { href: "/painel/usuarios", label: "Usuários", Icon: IconUser },
      { href: "/painel/grupos", label: "Grupos", Icon: IconUsers },
      { href: "/painel/orgaos", label: "Órgãos e Unidades", Icon: IconLandmark },
      { href: "/painel/integracoes", label: "Integrações", Icon: IconPlug },
      { href: "/painel/automacao", label: "Automação", Icon: IconRobo },
      { href: "/painel/armazenamento", label: "Armazenamento", Icon: IconDatabase },
      { href: "/painel/auditoria", label: "Auditoria", Icon: IconClock },
      { href: "/painel/aparencia", label: "Aparência", Icon: IconPalette },
      { href: "/painel/design-system", label: "Componentes", Icon: IconLayers },
    ],
};

/** As seções visíveis: os MÓDULOS (as telas efetivas, agrupadas pelo ADM) + a Administração (só o ADM). */
function secoesVisiveis(admin: boolean, modulos: readonly SecaoModulo[]): NavSecao[] {
  const porAba = new Map(NAV_MODULOS.map((m) => [m.aba as string, m]));
  const secoes: NavSecao[] = modulos.map((m) => ({ chave: m.id, titulo: m.nome, itens: m.telas.flatMap((t) => porAba.get(t) ?? []) }));
  return [...secoes, ...(admin ? [ADMINISTRACAO] : [])].filter((s) => s.itens.length > 0);
}

function itemAtivo(pathname: string, item: NavItem): boolean {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function Brand({ compact = false, identidade }: { compact?: boolean; identidade?: Identidade }) {
  return (
    <Link href="/painel" className="flex min-w-0 items-center">
      <MarcaSistema identidade={identidade} compacta={compact} />
    </Link>
  );
}

function NavLinks({
  admin,
  modulos,
  onNavigate,
}: {
  admin: boolean;
  modulos: readonly SecaoModulo[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-4">
      {secoesVisiveis(admin, modulos).map((secao) => (
        <div key={secao.chave}>
          {/* Recolhido, o título vira uma linha curta centrada no trilho (o separador do módulo). */}
          <div className="relative mb-1.5">
            <p className="menu-esconde truncate px-2 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-faint">{secao.titulo}</p>
            <span aria-hidden="true" className="menu-linha pointer-events-none absolute left-[10px] top-1/2 h-px w-6 bg-border-2" />
          </div>
          <nav className="flex flex-col gap-0.5">
            {secao.itens.map((item) => {
              const active = itemAtivo(pathname, item);
              const { Icon } = item;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-[11px] whitespace-nowrap rounded-chip border px-[12px] py-2 text-[13.5px] transition-colors duration-[var(--motion-duration)] ${
                    active
                      ? "border-border-2 bg-sb-active font-semibold text-text"
                      : "border-transparent font-medium text-text-2 hover:bg-surface-2 hover:text-text"
                  }`}
                >
                  <Icon
                    className={`h-[17px] w-[17px] shrink-0 ${active ? "text-accent" : ""}`}
                    strokeWidth={1.8}
                  />
                  <span className="menu-esconde min-w-0 truncate">{item.label}</span>
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
    <div className="menu-cartao flex items-stretch gap-1 overflow-hidden rounded-card border border-border p-0.5">
      <Link
        href="/painel/perfil"
        onClick={onNavigate}
        title="Meu perfil"
        className="flex min-w-[38px] flex-1 items-center gap-2 rounded-control p-[3px] pr-1.5 transition-colors hover:bg-surface-2"
      >
        <Avatar nome={usuario.nome} foto={usuario.foto} />
        <div className="menu-esconde min-w-0">
          {/* O APELIDO (nome de exibição) — o nome completo no title. */}
          <div className="truncate text-sm font-semibold text-text" title={usuario.nome}>
            {nomeExibicao(usuario)}
          </div>
          <div className="truncate text-[11px] text-muted">{usuario.papel.nome}</div>
        </div>
      </Link>
      <button
        type="button"
        onClick={sair}
        disabled={saindo}
        title="Sair"
        aria-label="Sair"
        className="menu-esconde grid w-11 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:text-[var(--danger)] disabled:opacity-60"
      >
        {saindo ? <IconSpinner className="h-[18px] w-[18px]" /> : <IconLogout className="h-[18px] w-[18px]" />}
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
      const res = await fetch("/api/grupos/ativo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grupoId: id }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      toast.error("Não foi possível trocar o grupo — tente de novo.");
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
          <SetaDropdown className="h-3.5 w-3.5 opacity-60" />
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
          <SetaDropdown className="hidden h-3.5 w-3.5 shrink-0 opacity-60 sm:block" />
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
      const res = await fetch("/api/reparticoes/ativo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reparticaoId: id }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      toast.error("Não foi possível trocar a unidade — tente de novo.");
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
          <SetaDropdown className="h-3.5 w-3.5 opacity-60" />
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

/** O último valor VÁLIDO de uma prop do servidor: `undefined` (a leitura falhou nesta recarga) mantém o anterior. */
/** Movimento desligado (sistema ou o ADM em Aparência). */
function semMovimento() {
  const m = document.documentElement.dataset.motion;
  return m === "off" || m === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useUltimoValido<T>(v: T | null | undefined): T | null {
  const ref = useRef<T | null>(v ?? null);
  if (v !== undefined) ref.current = v;
  return ref.current;
}

export function AppShell({
  children,
  usuario,
  grupos,
  grupoAtivoId,
  abas,
  modulos,
  reparticoes,
  reparticaoAtivaId,
  pcas = [],
  pcaFiltroId = null,
  identidade,
  notificacoes = 0,
  versaoDados,
  presenca: presencaServidor,
  chat: chatServidor,
}: {
  children: ReactNode;
  usuario: UsuarioSessao;
  grupos: GrupoNav[];
  grupoAtivoId: number | null;
  abas: string[];
  /** As seções do menu (os módulos com as telas abertas). */
  modulos: SecaoModulo[];
  reparticoes: ReparticaoNav[];
  reparticaoAtivaId: number | null;
  /** PCAs do seletor do cabeçalho (filtro global) e o escolhido (`null` = todos). */
  pcas?: PcaNav[];
  pcaFiltroId?: number | null;
  identidade?: Identidade;
  /** Notificações NÃO LIDAS (o número do sino). */
  notificacoes?: number;
  /** A VERSÃO DOS DADOS do servidor (`versaoDados`) — o `SincronizarDados` só recarrega quando ela muda. */
  versaoDados?: string;
  /** A PRESENÇA do grupo ativo (quem está online) — só quando o ADM a ligou; `null` = nada é montado; `undefined` = a
   * leitura falhou (mantém a que já estava — o canal e as conversas nunca caem por uma falha passageira). */
  presenca?: PresencaShell | null;
  /** O CHAT AO VIVO (o do grupo e/ou o privado ligados pelo ADM; só com a presença) — `null` = sem o chat. */
  chat?: ConfigChat | null;
}) {
  const presenca = useUltimoValido(presencaServidor);
  const chat = useUltimoValido(chatServidor);
  const [menuAberto, setMenuAberto] = useState(false);
  // Menu lateral recolhido (o atributo do <html> já veio do script antes da pintura; aqui só o espelho para a tela).
  const [recolhido, setRecolhido] = useState(false);
  // Logo depois de recolher, o ponteiro ainda está em cima: não reabre por cima até sair e voltar.
  const [semPeek, setSemPeek] = useState(false);
  useEffect(() => setRecolhido(document.documentElement.hasAttribute(ATRIBUTO_MENU)), []);
  const colunaRef = useRef<HTMLDivElement>(null);
  function alternarMenu() {
    const novo = !recolhido;
    // A coluna do conteúdo muda de largura UMA vez (nada reflui a cada quadro — grades, tabelas e gráficos não pulam) e
    // DESLIZA até o lugar novo por transform (FLIP), na mesma curva do menu.
    const coluna = colunaRef.current;
    const antes = coluna?.getBoundingClientRect().left ?? 0;
    document.documentElement.toggleAttribute(ATRIBUTO_MENU, novo);
    const desloca = coluna ? antes - coluna.getBoundingClientRect().left : 0;
    if (coluna && desloca && !semMovimento()) {
      coluna.animate([{ transform: `translateX(${desloca}px)` }, { transform: "none" }], {
        duration: 300,
        easing: "cubic-bezier(.32,.72,0,1)",
      });
    }
    try {
      localStorage.setItem(CHAVE_MENU, novo ? "1" : "0");
    } catch {
      /* sem armazenamento: vale nesta visita */
    }
    setRecolhido(novo);
    setSemPeek(novo);
  }
  const fecharMenu = () => setMenuAberto(false);
  // Esc fecha a gaveta (o caminho do teclado; o fundo escurecido é só do ponteiro) — menos com um diálogo por cima.
  useEffect(() => {
    if (!menuAberto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[role='dialog']")) setMenuAberto(false);
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [menuAberto]);
  const abasSet = new Set(abas);
  // O PCA do cabeçalho filtra a Mesa, o módulo PCA e o Orçamento — sem nenhuma dessas abas, o seletor não aparece.
  const filtraPca = abasSet.has("dfd") || abasSet.has("pca") || abasSet.has("orcamento");

  return (
    <CanalGrupo
      presenca={presenca}
      usuarioId={usuario.id}
      grupoId={grupoAtivoId}
      grupoNome={grupos.find((g) => g.id === grupoAtivoId)?.nome ?? null}
      chatGrupo={!!chat?.grupo} chatPrivado={!!chat?.privado}
    >
    {/* As Novidades mostram só as mudanças das telas que o grupo abre (o ADM vê tudo). */}
    <AcessoNovidades telas={abas} admin={usuario.admin}>
    <div className="min-h-dvh bg-bg text-text lg:flex lg:overflow-x-clip">
      {versaoDados != null && <SincronizarDados versao={versaoDados} />}
      {/* Sidebar desktop — a VAGA (sticky, altura do display) anima a largura e empurra o conteúdo; o menu dentro dela é
          absoluto: recolhido vira o trilho de ícones e, ao passar o mouse, abre POR CIMA do conteúdo (sem empurrar). O
          conteúdo tem largura fixa — nada reflui na animação, só é cortado. Regras em globals.css (.menu-vaga). */}
      <div className="menu-vaga relative z-40 hidden shrink-0 lg:sticky lg:top-0 lg:block lg:h-dvh print:!hidden">
        <aside
          data-sem-peek={semPeek ? "" : undefined}
          onPointerLeave={() => setSemPeek(false)}
          className="menu-lateral absolute inset-y-0 left-0 flex flex-col overflow-hidden border-r border-border bg-surface"
        >
          <div className="flex h-full w-full min-w-0 flex-col">
            {/* Faixa da marca na ALTURA do cabeçalho (a borda de baixo continua a dele) */}
            <div className="flex h-[var(--h-header)] shrink-0 items-center border-b border-border px-3">
              <Brand identidade={identidade} />
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-4">
              <NavLinks admin={usuario.admin} modulos={modulos} />
            </div>
            <div className="p-2 pt-0">
              <UserMenu usuario={usuario} />
              <div className="mt-0.5 flex items-center">
                <button
                  type="button"
                  onClick={alternarMenu}
                  aria-pressed={recolhido}
                  aria-label={recolhido ? "Expandir o menu" : "Recolher o menu"}
                  title={recolhido ? "Expandir o menu" : "Recolher o menu"}
                  className="grid h-8 w-11 shrink-0 place-items-center rounded-control text-faint transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <IconRecolherMenu className="menu-alternar h-[18px] w-[18px]" strokeWidth={1.8} />
                </button>
                <div className="menu-esconde min-w-0 flex-1">
                  <VersaoSistema className="justify-start" />
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Drawer mobile (menu hambúrguer) — reusa a mesma navegação da sidebar */}
      {menuAberto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div aria-hidden="true" className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm" onClick={fecharMenu} />
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
              <NavLinks admin={usuario.admin} modulos={modulos} onNavigate={fecharMenu} />
            </div>
            <div className="p-2 pt-0 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))]">
              <UserMenu usuario={usuario} onNavigate={fecharMenu} />
              <VersaoSistema onNavigate={fecharMenu} />
            </div>
          </aside>
        </div>
      )}

      {/* Coluna principal */}
      <div ref={colunaRef} className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[var(--h-header)] items-center gap-2 border-b border-border bg-surface px-[var(--pad-canvas)] print:hidden">
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setMenuAberto(true)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-text-2 transition-colors hover:bg-surface-2 lg:hidden"
          >
            <IconMenu className="h-5 w-5" />
          </button>
          {/* Com a presença no cabeçalho, a marca sai abaixo de 400px (está no menu) — o seletor de PCA segue legível. */}
          <div className={`shrink-0 lg:hidden ${presenca ? "max-[399px]:hidden" : ""}`}>
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
            {/* UM componente só: quem está online + as conversas (abas no mesmo painel); as bolhas do chat flutuam. */}
            {presenca && (presenca.ver || chat) && (
              <ChatAoVivo config={chat}>
                <PresencaGrupo verMesa={abasSet.has("dfd")} verOnline={presenca.ver} />
              </ChatAoVivo>
            )}
            <SinoNotificacoes naoLidas={notificacoes} configurarHref={usuario.admin ? "/painel/configuracoes?aba=notificacoes" : "/painel/perfil"} />
            <ThemeToggle />
            <Link href="/painel/perfil" aria-label="Meu perfil" className="inline-flex h-11 w-11 items-center justify-center rounded-control lg:hidden">
              <Avatar nome={usuario.nome} foto={usuario.foto} size="sm" />
            </Link>
          </div>
        </header>

        {/* Laterais = --pad-canvas (a do menu e da borda); topo e base = --pad-canvas-y (as 4 distâncias proporcionais);
            no celular, a base soma a navegação inferior (4rem + área segura). */}
        <main className="flex-1 px-[var(--pad-canvas)] py-[var(--pad-canvas-y)] pb-[calc(var(--pad-canvas-y)_+_4rem_+_env(safe-area-inset-bottom))] lg:pb-[var(--pad-canvas-y)]">
          {children}
        </main>
      </div>

      {/* Navegação inferior (mobile) */}
      <BottomNav telas={modulos.flatMap((m) => m.telas)} />
    </div>
    </AcessoNovidades>
    </CanalGrupo>
  );
}
