"use client";

import type { VersoesDados } from "@/lib/versao-dados-core";
import Link from "next/link";
import { rotaInicial } from "@/lib/abas";
import { usePathname, useRouter } from "next/navigation";
import { telaDaRota } from "@/lib/escopo-unidades-core";
import { type ReactNode, useRef, useState } from "react";
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
import { TrilhaCabecalho } from "./TrilhaCabecalho";
import { GatilhoPesquisa, PesquisaSistema } from "./PesquisaSistema";
import { CabecalhoApp, GavetaMenu, ItensMenu, MenuLateral } from "./MenuLateral";
import { toast } from "./Toast";
import {
  IconAlternarNivel,
  IconBox,
  IconBuilding,
  IconLandmark,
  IconCheck,
  IconClock,
  IconDatabase,
  IconLogout,
  IconLayers,
  IconPalette,
  IconPlug,
  IconRobo,
  IconSettings,
  IconSpinner,
  IconUser,
  IconUsers,
} from "./icons";
import type { UsuarioSessao } from "@/lib/auth";
import { nomeExibicao } from "@/lib/pessoa";

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

function Brand({ compact = false, identidade, inicio }: { compact?: boolean; identidade?: Identidade; inicio: string }) {
  // Direto à tela inicial da pessoa (a 1ª que ela abre) — sem passar pelo redirecionamento do `/painel`.
  return (
    <Link href={inicio} className="flex min-w-0 items-center">
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
  return <ItensMenu secoes={secoesVisiveis(admin, modulos)} ativo={(item) => itemAtivo(pathname, item)} onNavigate={onNavigate} />;
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
    <div className="menu-cartao flex w-full shrink-0 items-stretch overflow-hidden rounded-card border border-border p-0.5 max-lg:w-auto">
      <Link
        href="/painel/perfil"
        onClick={onNavigate}
        title="Meu perfil"
        className="flex min-w-[37px] flex-1 items-center gap-2 overflow-hidden rounded-control p-[2.5px] pr-1.5 transition-colors hover:bg-surface-2"
      >
        <Avatar nome={usuario.nome} foto={usuario.foto} className="max-w-none" />
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
        className="menu-esconde menu-sair ml-1 grid w-11 shrink-0 place-items-center overflow-hidden rounded-control text-muted transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:text-[var(--danger)] disabled:opacity-60"
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
      width={280}
      trigger={
        <>
          {trocando ? (
            <IconSpinner className="h-3.5 w-3.5" />
          ) : (
            <IconUsers className="h-3.5 w-3.5 opacity-70" />
          )}
          <span className="max-w-[9rem] truncate sm:max-w-none sm:whitespace-nowrap" title={ativo.nome}>{ativo.nome}</span>
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
              <span className="min-w-0 flex-1 break-words">{g.nome}</span>
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
  // "Todos os PCAs" só faz sentido com MAIS de um PCA; com um só, o gatilho mostra ele.
  const varios = pcas.length > 1;
  const rotulo = ativo ?? (varios ? null : pcas[0]);

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
      align="end"
      ariaLabel={`PCA do cabeçalho: ${ativo ? `${ativo.nome} (${ativo.ano})` : "todos os PCAs"} — filtra todo o sistema`}
      triggerClassName={`gap-1 rounded-chip border px-2 h-11 min-w-11 justify-center text-[13px] font-medium sm:gap-1.5 sm:px-3 lg:h-[var(--h-control-sm)] ${
        ativo ? "border-accent/50 bg-accent-soft text-accent" : "border-border-2 bg-surface text-text-2 hover:bg-surface-2"
      }`}
      width={300}
      trigger={
        <>
          {trocando ? <IconSpinner className="h-3.5 w-3.5 shrink-0" /> : <IconBox className="h-3.5 w-3.5 shrink-0 opacity-70" />}
          <span className="truncate sm:hidden">{rotulo ? `PCA ${rotulo.ano}` : "Todos"}</span>
          <span className="hidden whitespace-nowrap sm:inline">{rotulo ? rotulo.nome : "Todos os PCAs"}</span>
          <IconAlternarNivel className="hidden h-3.5 w-3.5 shrink-0 opacity-60 sm:block" />
        </>
      }
    >
      {(close) => (
        <div className="max-h-[min(60vh,380px)] overflow-y-auto p-1">
          {varios && (
            <button type="button" onClick={() => trocar(null, close)} className={opcao(ativo == null)}>
              <IconBox className="h-4 w-4 shrink-0 opacity-70" />
              <span className="min-w-0 flex-1 break-words">Todos os PCAs</span>
              {ativo == null && <IconCheck className="ml-auto h-4 w-4 shrink-0" />}
            </button>
          )}
          {pcas.map((p) => (
            <button key={p.id} type="button" onClick={() => trocar(p.id, close)} className={opcao(p.id === ativo?.id)}>
              <span className="shrink-0 font-mono text-[10.5px] text-faint">{p.ano}</span>
              <span className="min-w-0 flex-1 break-words">{p.nome}</span>
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
      width={340}
      trigger={
        <>
          {trocando ? (
            <IconSpinner className="h-3.5 w-3.5" />
          ) : (
            <IconBuilding className="h-3.5 w-3.5 opacity-70" />
          )}
          <span className="max-w-[9rem] truncate sm:max-w-none sm:whitespace-nowrap" title={ativa.nome}>{ativa.nome}</span>
          <SetaDropdown className="h-3.5 w-3.5 opacity-60" />
        </>
      }
    >
      {(close) => <ListaUnidades reparticoes={reparticoes} ativaId={ativa.id} onEscolher={(id) => trocar(id, close)} />}
    </Dropdown>
  );
}

/** A lista do seletor de unidade — o desenho do filtro de unidades das tabelas: busca no topo, a SIGLA em cima e o
 *  NOME por extenso embaixo (menor), a escolhida em accent com o check. A busca acha pela sigla ou pelo nome. */
function ListaUnidades({
  reparticoes,
  ativaId,
  onEscolher,
}: {
  reparticoes: ReparticaoNav[];
  ativaId: number;
  onEscolher: (id: number) => void;
}) {
  const [q, setQ] = useState("");
  const termo = semAcento(q.trim());
  const visiveis = termo ? reparticoes.filter((r) => semAcento(`${r.codigo} ${r.nome}`).includes(termo)) : reparticoes;
  return (
    <div className="flex max-h-[min(70vh,440px)] w-full flex-col">
      {reparticoes.length > 8 && (
        <div className="border-b border-border p-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && visiveis.length === 1) onEscolher(visiveis[0].id);
            }}
            aria-label="Buscar unidade por sigla ou nome"
            placeholder="Buscar sigla ou nome"
            className="h-11 w-full rounded-control border border-border-2 bg-surface px-2.5 text-[13px] text-text outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:h-[var(--h-control-sm)]"
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {visiveis.map((r) => {
          const ativa = r.id === ativaId;
          const mesmo = semAcento(r.codigo) === semAcento(r.nome);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onEscolher(r.id)}
              className={`flex min-h-11 w-full items-center gap-2.5 rounded-control px-2.5 py-1.5 text-left lg:min-h-0 ${
                ativa ? "bg-accent-soft text-accent" : "text-text-2 hover:bg-surface-2"
              }`}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={`break-words text-[13px] ${ativa ? "font-semibold" : "font-medium text-text"}`}>{r.codigo}</span>
                {!mesmo && <span className={`break-words text-[11px] leading-snug ${ativa ? "text-accent/80" : "text-faint"}`}>{r.nome}</span>}
              </span>
              {ativa && <IconCheck className="h-4 w-4 shrink-0" />}
            </button>
          );
        })}
        {visiveis.length === 0 && <div className="px-3 py-4 text-center text-[12px] text-faint">Nenhuma unidade encontrada</div>}
      </div>
    </div>
  );
}

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** O último valor VÁLIDO de uma prop do servidor: `undefined` (a leitura falhou nesta recarga) mantém o anterior. */
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
  reparticoes: reparticoesBase,
  reparticaoAtivaId: ativaBase,
  unidadesPorTela,
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
  /** Grupo de "unidade de cadastro": nas `telas` marcadas pelo ADM, o seletor mostra TODAS as unidades (`lista`). */
  unidadesPorTela?: { telas: readonly string[]; lista: ReparticaoNav[]; ativaId: number | null };
  /** PCAs do seletor do cabeçalho (filtro global) e o escolhido (`null` = todos). */
  pcas?: PcaNav[];
  pcaFiltroId?: number | null;
  identidade?: Identidade;
  /** Notificações NÃO LIDAS (o número do sino). */
  notificacoes?: number;
  /** As VERSÕES DOS DADOS do servidor (`versaoDados`) — o `SincronizarDados` só recarrega quando a da tela muda. */
  versaoDados?: VersoesDados;
  /** A PRESENÇA do grupo ativo (quem está online) — só quando o ADM a ligou; `null` = nada é montado; `undefined` = a
   * leitura falhou (mantém a que já estava — o canal e as conversas nunca caem por uma falha passageira). */
  presenca?: PresencaShell | null;
  /** O CHAT AO VIVO (o do grupo e/ou o privado ligados pelo ADM; só com a presença) — `null` = sem o chat. */
  chat?: ConfigChat | null;
}) {
  const telaAtual = telaDaRota(usePathname());
  const porTela = unidadesPorTela && telaAtual && unidadesPorTela.telas.includes(telaAtual) ? unidadesPorTela : null;
  const reparticoes = porTela ? porTela.lista : reparticoesBase;
  const reparticaoAtivaId = porTela ? porTela.ativaId : ativaBase;
  const presenca = useUltimoValido(presencaServidor);
  const chat = useUltimoValido(chatServidor);
  const [menuAberto, setMenuAberto] = useState(false);
  const fecharMenu = () => setMenuAberto(false);
  const abasSet = new Set(abas);
  const inicio = rotaInicial(abasSet);
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
      {versaoDados != null && <SincronizarDados versoes={versaoDados} />}
      <MenuLateral
        topo={<Brand identidade={identidade} inicio={inicio} />}
        semMarca={<GatilhoPesquisa />}
        conteudo={<NavLinks admin={usuario.admin} modulos={modulos} />}
        rodape={<UserMenu usuario={usuario} />}
        extraRodape={(usuario.admin || usuario.papel.detalhes.novidades.ver) && <VersaoSistema className="justify-start" />}
      />

      {/* Gaveta mobile (menu hambúrguer) — a mesma navegação do menu lateral */}
      <GavetaMenu
        aberto={menuAberto}
        onFechar={fecharMenu}
        topo={<Brand identidade={identidade} inicio={inicio} />}
        acima={
          (reparticoes.length > 0 || grupos.length > 0) && (
            <div className="flex flex-wrap gap-2 px-4 pt-3 sm:hidden">
              <ReparticaoSelect reparticoes={reparticoes} ativaId={reparticaoAtivaId} />
              <GrupoSelect grupos={grupos} ativoId={grupoAtivoId} />
            </div>
          )
        }
        conteudo={
          <>
            <div className="mb-3" onClickCapture={fecharMenu} role="none">
              <GatilhoPesquisa />
            </div>
            <NavLinks admin={usuario.admin} modulos={modulos} onNavigate={fecharMenu} />
          </>
        }
        rodape={
          <>
            <UserMenu usuario={usuario} onNavigate={fecharMenu} />
            {(usuario.admin || usuario.papel.detalhes.novidades.ver) && <VersaoSistema onNavigate={fecharMenu} />}
          </>
        }
      />

      {/* Coluna principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <CabecalhoApp
          onMenu={() => setMenuAberto(true)}
          inicio={
            <>
          {/* Com a presença no cabeçalho, a marca sai abaixo de 400px (está no menu) — o seletor de PCA segue legível. */}
          <div className={`shrink-0 sm:hidden ${presenca ? "max-[399px]:hidden" : ""}`}>
            <Brand compact identidade={identidade} inicio={inicio} />
          </div>
          {/* Trilha (Seção › Tela ⌃⌄ › PCA ⌃⌄) — à esquerda, no desktop. */}
          <TrilhaCabecalho secoes={secoesVisiveis(usuario.admin, modulos)} pcas={pcas} pcaFiltroId={pcaFiltroId} />
            </>
          }
          direita={
            <>
            {/* PCA do cabeçalho (filtro de todo o sistema) — à DIREITA; só para quem vê o que ele filtra (Mesa, PCA,
                Orçamento). É o único item que ENCOLHE numa tela estreita (o rótulo trunca). */}
            {filtraPca && (
              <div className="min-w-0">
                <PcaSelect pcas={pcas} ativoId={pcaFiltroId} />
              </div>
            )}
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
            </>
          }
        />

        {/* Laterais = --pad-canvas (a do menu e da borda); topo e base = --pad-canvas-y (as 4 distâncias proporcionais);
            no celular, a base soma a navegação inferior (4rem + área segura). */}
        <main className="flex-1 px-[var(--pad-canvas)] py-[var(--pad-canvas-y)] pb-[calc(var(--pad-canvas-y)_+_4rem_+_env(safe-area-inset-bottom))] lg:pb-[var(--pad-canvas-y)]">
          {children}
        </main>
      </div>

      <PesquisaSistema
        telas={secoesVisiveis(usuario.admin, modulos).flatMap((sc) => sc.itens.map((i) => ({ ...i, secao: sc.titulo })))}
        pcas={pcas}
        pcaFiltroId={pcaFiltroId}
      />
      {/* Navegação inferior (mobile) */}
      <BottomNav telas={modulos.flatMap((m) => m.telas)} />
    </div>
    </AcessoNovidades>
    </CanalGrupo>
  );
}
