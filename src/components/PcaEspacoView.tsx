"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { type FontePca, ROTULO_FONTE, ROTULO_STATUS, type StatusPca } from "@/lib/pca-core";
import { AbasEspaco } from "./AbasEspaco";
import { Badge } from "./Badge";
import { IconChevronLeft } from "./icons";

export type AbaPca = "dashboard" | "orcamento" | "mesa" | "configuracao";

/**
 * ESPAÇO do PCA (`/painel/pca/[id]`) — enxuto como a tela do orçamento, usando a largura toda: UMA linha de cabeçalho
 * (voltar · nome · ano · status · fonte) e a barra das abas **Dashboard · Orçamento · Mesa|Importação · Configuração**
 * com as ferramentas da aba à direita (`AbasEspaco` + `FerramentasAba`; o servidor monta SÓ a aba ativa). A capa fica no
 * card e na Configuração.
 */
export function PcaEspacoView({
  pca,
  aba,
  children,
}: {
  pca: { nome: string; ano: number | null; fonte: FontePca; status: StatusPca };
  /** A aba que o servidor montou (`children`). */
  aba: AbaPca;
  children: ReactNode;
}) {
  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <Link
          href="/painel/pca"
          aria-label="Voltar para PCA"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-text lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
        >
          <IconChevronLeft className="h-4 w-4" />
        </Link>
        <h1 className="min-w-0 truncate text-lg font-bold text-text" title={pca.nome}>
          {pca.nome}
        </h1>
        {pca.ano != null && <Badge tone="blue">{pca.ano}</Badge>}
        <Badge tone={pca.status === "publicado" ? "emerald" : "amber"} dot>
          {ROTULO_STATUS[pca.status]}
        </Badge>
        <span className="text-sm text-muted">{ROTULO_FONTE[pca.fonte]}</span>
      </div>

      <AbasEspaco<AbaPca>
        aba={aba}
        opcoes={[
          { value: "dashboard", label: "Dashboard" },
          { value: "orcamento", label: "Orçamento" },
          { value: "mesa", label: pca.fonte === "lista" ? "Importação" : "Mesa" },
          { value: "configuracao", label: "Configuração" },
        ]}
      >
        {children}
      </AbasEspaco>
    </div>
  );
}
