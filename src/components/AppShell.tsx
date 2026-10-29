"use client";

import type { VersoesDados } from "@/lib/versao-dados-core";
import Link from "next/link";
import { Button } from "./Button";
import { rotaInicial } from "@/lib/abas";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { chaveDaRota } from "@/lib/escopo-unidades-core";
import { type ReactNode, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { ContasNavegador } from "./ContasNavegador";
import { BottomNav } from "./BottomNav";
import { Dropdown } from "./Dropdown";
import { type Identidade, MarcaLink } from "./MarcaSistema";
import { NAV_MODULOS } from "./navModulos";
import type { PcaCardDados } from "./PcaCard";
import { PcaSeletor } from "./PcaSeletor";
import { AcessoNovidades, VersaoSistema } from "./Novidades";
import { PreCarregarTelas, SincronizarDados } from "./SincronizarDados";
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
import { SeletorUnidade } from "./SeletorUnidade";
import { toast } from "./Toast";
import {
  IconBox,
  IconLandmark,
  IconCheck,
  IconClock,
  IconDatabase,
  IconLayers,
  IconPalette,
  IconPlug,
  IconRobo,
  IconSettings,
  IconSpinner,
  IconUser,
  IconUsers,
  IconWeb,
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

const DICA_SITE = "Abrir a página pública";

function itemAtivo(pathname: string, item: NavItem): boolean {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
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
 * PCA do CABEÇALHO (o `PcaSeletor`, o MESMO da tela pública) — o filtro GLOBAL (cookie, como a unidade e o grupo): a Mesa, os cards do módulo PCA e o Orçamento
 * mostram só o PCA escolhido; "Todos os PCAs" = sem filtro. Dentro do espaço de um PCA, escolher outro leva ao espaço
 * dele (na mesma aba). No celular o gatilho mostra só o ANO (o nome inteiro na lista).
 */
function PcaSelect({ pcas, ativoId }: { pcas: PcaCardDados[]; ativoId: number | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [trocando, setTrocando] = useState(false);
  // A escolha vale NA HORA pelo estado local: o layout é COMPARTILHADO — ir de um espaço de PCA a outro (push) não o
  // renderiza de novo, e o `ativoId` do servidor ficaria o antigo. Quando o servidor manda outro valor (refresh), ele vale.
  const [sel, setSel] = useState(ativoId);
  const [doServidor, setDoServidor] = useState(ativoId);
  if (doServidor !== ativoId) {
    setDoServidor(ativoId);
    setSel(ativoId);
  }

  async function trocar(id: number | null) {
    if (id === sel) return;
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

  // "Todos os PCAs" só faz sentido com MAIS de um PCA; com um só, o gatilho mostra ele.
  return <PcaSeletor pcas={pcas} atual={sel} todos={pcas.length > 1} trocando={trocando} onEscolher={trocar} align="end" />;
}

type ReparticaoNav = { id: number; codigo: string; nome: string };

/** Seletor de repartição ativa no cabeçalho (entre as do grupo ativo). */
function ReparticaoSelect({ reparticoes, ativaId, travado }: { reparticoes: ReparticaoNav[]; ativaId: number | null; travado?: boolean }) {
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

  return <SeletorUnidade unidades={reparticoes} ativaId={ativa.id} trocando={trocando} travado={travado ? "Minhas unidades" : undefined} onEscolher={(id, close) => id != null && trocar(id, close)} />;
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
  reparticoes,
  reparticaoAtivaId,
  travadas,
  pcas = [],
  pcaFiltroId = null,
  cartoesPca = [],
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
  /** Grupos → Acesso por aba: as abas (tela.aba) em "Soma" — o seletor de unidade trava. */
  travadas?: readonly string[];
  /** PCAs do seletor do cabeçalho (filtro global) e o escolhido (`null` = todos). */
  pcas?: PcaNav[];
  pcaFiltroId?: number | null;
  /** Os CARTÕES desses PCAs (capa e números) — o seletor do cabeçalho os mostra. */
  cartoesPca?: PcaCardDados[];
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
  const busca = useSearchParams();
  const chaveAtual = chaveDaRota(usePathname(), { aba: busca.get("aba"), pca: busca.get("pca") });
  const travado = !!chaveAtual && !!travadas?.includes(chaveAtual);
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
      <PreCarregarTelas telas={secoesVisiveis(usuario.admin, modulos).flatMap((sc) => sc.itens.map((i) => i.href))} versoes={versaoDados} />
      <MenuLateral
        topo={<MarcaLink href="/" dica={DICA_SITE} identidade={identidade} />}
        semMarca={<GatilhoPesquisa />}
        conteudo={<NavLinks admin={usuario.admin} modulos={modulos} />}
        rodape={<ContasNavegador usuario={usuario} />}
        extraRodape={(usuario.admin || usuario.papel.detalhes.novidades.ver) && <VersaoSistema className="justify-start" />}
      />

      {/* Gaveta mobile (menu hambúrguer) — a mesma navegação do menu lateral */}
      <GavetaMenu
        aberto={menuAberto}
        onFechar={fecharMenu}
        topo={<MarcaLink href="/" dica={DICA_SITE} identidade={identidade} />}
        acima={
          (reparticoes.length > 0 || grupos.length > 0) && (
            <div className="flex flex-wrap gap-2 px-4 pt-3 sm:hidden">
              <ReparticaoSelect reparticoes={reparticoes} ativaId={reparticaoAtivaId} travado={travado} />
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
            <ContasNavegador usuario={usuario} onNavigate={fecharMenu} />
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
            <MarcaLink href="/" dica={DICA_SITE} compacta identidade={identidade} />
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
                <PcaSelect pcas={cartoesPca} ativoId={pcaFiltroId} />
              </div>
            )}
            <div className="hidden items-center gap-1.5 sm:flex">
              <ReparticaoSelect reparticoes={reparticoes} ativaId={reparticaoAtivaId} travado={travado} />
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
            {/* O último item: atalho para a página pública (no celular, só o ícone). */}
            <Button href="/" variant="secondary" size="sm" aria-label="Abrir a página pública" title="Abrir a página pública" icon={<IconWeb className="h-4 w-4" />}>
              <span className="hidden sm:inline">Site</span>
            </Button>
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
