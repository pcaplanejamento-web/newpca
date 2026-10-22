"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { ROTULO_VISTA_PUBLICA, type VistaPublica } from "@/lib/publico-core";
import { Button } from "./Button";
import { IconDashboard, IconDocumentos, IconLinhas, IconSettings, IconTelaAcesso, IconWallet } from "./icons";
import { type Identidade, MarcaSistema } from "./MarcaSistema";
import { CabecalhoApp, GavetaMenu, ItensMenu, MenuLateral, type SecaoMenu } from "./MenuLateral";
import { PcaSeletor } from "./PcaSeletor";
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
  vista,
  pcaId,
  pcas,
  unidades,
  painel,
  children,
}: {
  /** Logado: o botão do cabeçalho que volta ao sistema (Configurações para o ADM). */
  painel?: { href: string; rotulo: string } | null;
  identidade?: Identidade;
  /** Os itens do menu (as abas publicadas pelo ADM + a consulta de itens) — `vistasDoMenu`. */
  vistas: readonly VistaPublica[];
  vista: VistaPublica;
  pcaId: number | null;
  pcas: { id: number; nome: string }[];
  /** O filtro de unidade do cabeçalho — só na vista que o usa (Dashboard/consulta) e com 2+ unidades. */
  unidades?: { lista: { id: number; codigo: string; municipio: string }[]; atual?: number };
  children: ReactNode;
}) {
  const [gaveta, setGaveta] = useState(false);
  const router = useRouter();
  const [trocando, iniciar] = useTransition();
  const href = (a: VistaPublica, unidade = unidades?.atual) => {
    const q = new URLSearchParams();
    if (pcaId != null) q.set("pca", String(pcaId));
    if (a !== "dashboard") q.set("aba", a);
    if (unidade != null && (a === "dashboard" || a === "consulta")) q.set("unidade", String(unidade));
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };
  const secoes: SecaoMenu[] = [{ chave: "pca", itens: vistas.map((a) => ({ href: href(a), label: ROTULO_VISTA_PUBLICA[a], Icon: ICONE[a] })) }];
  const ativo = (item: { href: string }) => item.href === href(vista);
  const marca = (
    <Link href="/" className="flex min-w-0 items-center">
      <MarcaSistema identidade={identidade} />
    </Link>
  );
  const entrar = (
    <Button href="/login" variant="primary" icon={<IconTelaAcesso className="h-4 w-4" />} className="w-full rounded-full opacity-60 hover:opacity-100 focus-visible:opacity-100 motion-safe:active:scale-[0.96]">
      Entrar
    </Button>
  );
  const itens = (fechar?: () => void) => <ItensMenu secoes={secoes} ativo={ativo} onNavigate={fechar} />;

  return (
    <div className="flex min-h-dvh bg-bg text-text lg:overflow-x-clip">
      <MenuLateral guardar={false} topo={marca} conteudo={itens()} rodape={<div className="menu-esconde mb-2 px-1">{entrar}</div>} />
      <GavetaMenu aberto={gaveta} onFechar={() => setGaveta(false)} topo={marca} conteudo={itens(() => setGaveta(false))} rodape={entrar} />
      <div className="flex min-w-0 flex-1 flex-col">
        <CabecalhoApp
          onMenu={() => setGaveta(true)}
          inicio={<div className="hidden min-w-0 sm:block lg:hidden">{marca}</div>}
          direita={
            <>
              {pcaId != null && pcas.length > 1 && (
                <div className="w-36 min-w-0 sm:w-56">
                  <PcaSeletor pcas={pcas} current={pcaId} compacto />
                </div>
              )}
              {unidades && unidades.lista.length > 1 && (
                <SeletorUnidade
                  unidades={unidades.lista.map((u) => ({ id: u.id, codigo: u.codigo, nome: u.municipio || u.codigo }))}
                  ativaId={unidades.atual ?? null}
                  todas="Todas as unidades"
                  trocando={trocando}
                  onEscolher={(id, fechar) => {
                    fechar();
                    if (id !== (unidades.atual ?? null)) iniciar(() => router.push(href(vista, id ?? undefined)));
                  }}
                />
              )}
              {painel && (
                <Button href={painel.href} variant="icon" size="sm" aria-label={painel.rotulo} title={painel.rotulo} icon={<IconSettings className="h-4 w-4" />} />
              )}
              <ThemeToggle />
            </>
          }
        />
        <main className="min-w-0 flex-1 space-y-[var(--gap-block)] px-[var(--pad-canvas)] py-[var(--pad-canvas-y)]">{children}</main>
      </div>
    </div>
  );
}
