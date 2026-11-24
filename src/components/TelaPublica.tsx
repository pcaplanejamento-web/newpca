"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { ROTULO_VISTA_PUBLICA, type VistaPublica } from "@/lib/publico-core";
import { GatilhoPesquisa } from "./BannerPesquisa";
import type { ConfigCaptcha } from "./CodigoEmail";
import { EmitirDocumentoPca } from "./EmitirDocumentoPca";
import { Button } from "./Button";
import { IconDashboard, IconDocumentos, IconTermo, IconLinhas, IconSettings, IconTelaAcesso, IconWallet } from "./icons";
import { type Identidade, MarcaLink } from "./MarcaSistema";
import { CabecalhoApp, GavetaMenu, ItensMenu, MenuLateral, type SecaoMenu } from "./MenuLateral";
import type { PcaCardDados } from "./PcaCard";
import { PcaSeletor } from "./PcaSeletor";
import { PesquisaPublica } from "./PesquisaPublica";
import { SeletorUnidade } from "./SeletorUnidade";
import { ThemeToggle } from "./ThemeToggle";

const ICONE: Record<VistaPublica, SecaoMenu["itens"][number]["Icon"]> = {
  dashboard: IconDashboard,
  consulta: IconLinhas,
  orcamento: IconWallet,
  documentos: IconDocumentos,
};

/**
 * A CASCA da tela pública (consulta do PCA sem login): o MESMO menu lateral do painel (recolhível; gaveta no celular) com
 * as abas que o ADM publicou (sem título de seção — no trilho recolhido não sobra linha) e o "Entrar" fixo no rodapé — só
 * com o menu aberto. O menu começa como o ADM escolheu e recolher/expandir vale só na visita (`guardar={false}`). O servidor decide a aba e só manda a dela.
 */
export function TelaPublica({
  identidade,
  vistas,
  menuRecolhido,
  vista,
  pcaId,
  pcas,
  soImagem = false,
  unidades,
  painel,
  documento,
  children,
}: {
  /** O DOCUMENTO OFICIAL do PCA ligado pelo ADM: o item "Emitir o PCA" no menu (some quando desligado). */
  documento?: { pcaNome: string; turnstile: ConfigCaptcha } | null;
  /** Logado: o botão do cabeçalho que volta ao sistema (Configurações para o ADM). */
  painel?: { href: string; rotulo: string; dica: string } | null;
  identidade?: Identidade;
  /** Os itens do menu (as abas publicadas pelo ADM + a consulta de itens) — `vistasDoMenu`. */
  vistas: readonly VistaPublica[];
  /** O menu começa recolhido (escolha do ADM) a cada chegada à tela. */
  menuRecolhido?: boolean;
  vista: VistaPublica;
  pcaId: number | null;
  /** Os PCAs publicados como CARTÕES (o seletor do cabeçalho). */
  pcas: PcaCardDados[];
  /** Os cartões do seletor só com a imagem (Configurações → Tela pública). */
  soImagem?: boolean;
  /** O filtro de unidade do cabeçalho — só na vista que o usa (Dashboard/consulta) e com 2+ unidades. */
  unidades?: { lista: { id: number; codigo: string; municipio: string }[]; atual?: number };
  children: ReactNode;
}) {
  const [gaveta, setGaveta] = useState(false);
  const router = useRouter();
  const [trocando, iniciar] = useTransition();
  // Trocar de PCA mantém a vista e limpa a unidade (as unidades são de cada PCA).
  const hrefPca = (id: number) => `/?pca=${id}${vista !== "dashboard" ? `&aba=${vista}` : ""}`;
  const href = (a: VistaPublica, unidade = unidades?.atual) => {
    const q = new URLSearchParams();
    if (pcaId != null) q.set("pca", String(pcaId));
    if (a !== "dashboard") q.set("aba", a);
    if (unidade != null && (a === "dashboard" || a === "consulta")) q.set("unidade", String(unidade));
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };
  const [emitir, setEmitir] = useState(false);
  const secoes: SecaoMenu[] = [
    { chave: "pca", itens: vistas.map((a) => ({ href: href(a), label: ROTULO_VISTA_PUBLICA[a], Icon: ICONE[a] })) },
    ...(documento && pcaId != null ? [{ chave: "documento", itens: [{ href: "#emitir-pca", label: "Emitir o PCA (PDF)", Icon: IconTermo, onClick: () => setEmitir(true) }] }] : []),
  ];
  const ativo = (item: { href: string }) => item.href === href(vista);
  const marca = <MarcaLink href={painel?.href ?? "/"} dica={painel?.dica} identidade={identidade} />;
  const marcaCompacta = <MarcaLink href={painel?.href ?? "/"} dica={painel?.dica ?? "Início"} identidade={identidade} compacta />;
  const entrar = (
    <Button href="/login" variant="primary" icon={<IconTelaAcesso className="h-4 w-4" />} className="w-full rounded-full opacity-60 hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 motion-safe:active:scale-[0.96]">
      Entrar
    </Button>
  );
  const seletorUnidade = (cheio = false) =>
    unidades && unidades.lista.length > 1 ? (
      <SeletorUnidade
        cheio={cheio}
        unidades={unidades.lista.map((u) => ({ id: u.id, codigo: u.codigo, nome: u.municipio || u.codigo }))}
        ativaId={unidades.atual ?? null}
        todas="Todas as unidades"
        trocando={trocando}
        onEscolher={(id, fechar) => {
          fechar();
          if (id !== (unidades.atual ?? null)) iniciar(() => router.push(href(vista, id ?? undefined)));
        }}
      />
    ) : null;
  const itens = (fechar?: () => void) => <ItensMenu secoes={secoes} ativo={ativo} onNavigate={fechar} />;

  return (
    <div className="flex min-h-dvh bg-bg text-text lg:overflow-x-clip">
      <MenuLateral guardar={false} inicial={menuRecolhido} topo={marca} conteudo={itens()} rodape={<div className="menu-esconde mb-2 px-1">{entrar}</div>} />
      <GavetaMenu aberto={gaveta} onFechar={() => setGaveta(false)} topo={marca} conteudo={itens(() => setGaveta(false))} rodape={entrar} />
      <div data-coluna-conteudo className="flex min-w-0 flex-1 flex-col">
        <CabecalhoApp
          onMenu={() => setGaveta(true)}
          inicio={
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              {/* Entre 640px e o menu lateral: só a logo (o nome está no menu) — com o nome, o PCA e a pesquisa ficavam um por cima
                  do outro. */}
              <div className="hidden shrink-0 sm:block lg:hidden">{marcaCompacta}</div>
              {/* À esquerda: o PCA, com os cartões de cada um ao abrir (só com 2+ publicados). */}
              {pcaId != null && pcas.length > 1 && (
                <div className="flex min-w-[4.5rem] max-w-[16rem] shrink sm:shrink-0">
                  <PcaSeletor pcas={pcas} atual={pcaId} soImagem={soImagem} href={hrefPca} />
                </div>
              )}
              {/* A PESQUISA de tudo o que a página mostra (Ctrl+K) — o mesmo banner da pesquisa do sistema. */}
              {pcaId != null && <GatilhoPesquisa cabecalho rotulo="Pesquisar na página" />}
            </div>
          }
          direita={
            <>
              {/* O filtro de unidade fica no cabeçalho a partir de 768px; no celular, numa linha própria no topo do conteúdo
                  (no cabeçalho ele espremia o seletor de PCA e cobria a pesquisa). */}
              {unidades && unidades.lista.length > 1 && <div className="hidden md:block">{seletorUnidade()}</div>}
              <ThemeToggle />
              {/* Sem sessão, no celular/tablet o "Entrar" fica à vista no cabeçalho (o do menu só aparece abrindo a gaveta). */}
              {!painel && (
                <Button href="/login" variant="primary" size="sm" aria-label="Entrar" title="Entrar" className="lg:hidden" icon={<IconTelaAcesso className="h-4 w-4" />}>
                  <span className="hidden sm:inline">Entrar</span>
                </Button>
              )}
              {/* O último item: volta ao sistema (no celular, só o ícone). */}
              {painel && (
                <Button href={painel.href} variant="secondary" size="sm" aria-label={painel.dica} title={painel.dica} icon={<IconSettings className="h-4 w-4" />}>
                  <span className="hidden sm:inline">{painel.rotulo}</span>
                </Button>
              )}
            </>
          }
        />
        {documento && pcaId != null && <EmitirDocumentoPca pcaId={pcaId} pcaNome={documento.pcaNome} turnstile={documento.turnstile} open={emitir} onClose={() => setEmitir(false)} />}
        {pcaId != null && <PesquisaPublica pcaId={pcaId} vista={vista} unidade={unidades?.atual} />}
        <main className="min-w-0 flex-1 space-y-[var(--gap-block)] pl-[var(--pad-canvas)] pr-[var(--pad-direita)] py-[var(--pad-canvas-y)]">
          {unidades && unidades.lista.length > 1 && <div className="md:hidden">{seletorUnidade(true)}</div>}
          {children}
        </main>
      </div>
    </div>
  );
}
