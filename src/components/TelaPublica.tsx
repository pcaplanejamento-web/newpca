"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import type { AbaPublica } from "@/lib/publico-core";
import { ROTULO_ABA_PUBLICA } from "@/lib/publico-core";
import { Button } from "./Button";
import { IconDashboard, IconDocumentos, IconMenu, IconTelaAcesso, IconWallet } from "./icons";
import { type Identidade, MarcaSistema } from "./MarcaSistema";
import { GavetaMenu, ItensMenu, MenuLateral, type SecaoMenu } from "./MenuLateral";
import { PcaSeletor } from "./PcaSeletor";
import { ThemeToggle } from "./ThemeToggle";

const ICONE: Record<AbaPublica, SecaoMenu["itens"][number]["Icon"]> = { dashboard: IconDashboard, orcamento: IconWallet, documentos: IconDocumentos };

/**
 * A CASCA da tela pública (consulta do PCA sem login): o MESMO menu lateral do painel (recolhível; gaveta no celular) com
 * as abas que o ADM publicou e o "Entrar" fixo no rodapé — só com o menu aberto. O servidor decide a aba e só manda a dela.
 */
export function TelaPublica({
  identidade,
  abas,
  aba,
  pcaId,
  pcas,
  children,
}: {
  identidade?: Identidade;
  abas: readonly AbaPublica[];
  aba: AbaPublica;
  pcaId: number | null;
  pcas: { id: number; nome: string }[];
  children: ReactNode;
}) {
  const [gaveta, setGaveta] = useState(false);
  const href = (a: AbaPublica) => {
    const q = new URLSearchParams();
    if (pcaId != null) q.set("pca", String(pcaId));
    if (a !== "dashboard") q.set("aba", a);
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };
  const secoes: SecaoMenu[] = [{ chave: "pca", titulo: "Consulta do PCA", itens: abas.map((a) => ({ href: href(a), label: ROTULO_ABA_PUBLICA[a], Icon: ICONE[a] })) }];
  const ativo = (item: { href: string }) => item.href === href(aba);
  const marca = (
    <Link href="/" className="flex min-w-0 items-center">
      <MarcaSistema identidade={identidade} />
    </Link>
  );
  const entrar = (
    <Button href="/login" variant="primary" icon={<IconTelaAcesso className="h-4 w-4" />} className="w-full rounded-full shadow-soft motion-safe:active:scale-[0.96]">
      Entrar
    </Button>
  );
  const itens = (fechar?: () => void) => <ItensMenu secoes={secoes} ativo={ativo} onNavigate={fechar} />;

  return (
    <div className="flex min-h-dvh bg-bg text-text lg:overflow-x-clip">
      <MenuLateral topo={marca} conteudo={itens()} rodape={<div className="menu-esconde mb-2 px-1">{entrar}</div>} />
      <GavetaMenu aberto={gaveta} onFechar={() => setGaveta(false)} topo={marca} conteudo={itens(() => setGaveta(false))} rodape={entrar} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-surface print:hidden">
          <div className="flex h-[var(--h-header)] items-center gap-2 px-[var(--pad-canvas)]">
            <button
              type="button"
              aria-label="Abrir menu"
              onClick={() => setGaveta(true)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-2 lg:hidden"
            >
              <IconMenu className="h-5 w-5" />
            </button>
            <div className="min-w-0 lg:hidden">{marca}</div>
            <div className="ml-auto flex min-w-0 items-center gap-2">
              {pcaId != null && pcas.length > 1 && (
                <div className="w-40 min-w-0 sm:w-64">
                  <PcaSeletor pcas={pcas} current={pcaId} />
                </div>
              )}
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1 space-y-[var(--gap-block)] px-[var(--pad-canvas)] py-[var(--pad-canvas-y)]">{children}</main>
      </div>
    </div>
  );
}
