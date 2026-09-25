"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { type FontePca, ROTULO_FONTE, ROTULO_STATUS, type StatusPca } from "@/lib/pca-core";
import { AbasEspaco } from "./AbasEspaco";
import { Badge } from "./Badge";
import { IconChevronLeft } from "./icons";
import { PcaCapa } from "./PcaCard";

export type AbaPca = "dashboard" | "orcamento" | "mesa" | "configuracao";

/**
 * ESPAÇO do PCA (`/painel/pca/[id]`): cabeçalho (capa, nome, status, fonte · ano) e as abas Dashboard ·
 * Orçamento · Mesa|Importação · Configuração no MESMO espaço (`AbasEspaco`: o servidor monta SÓ a aba ativa).
 */
export function PcaEspacoView({
  pca,
  aba,
  children,
}: {
  pca: { nome: string; ano: number | null; fonte: FontePca; status: StatusPca; capa: string | null };
  /** A aba que o servidor montou (`children`). */
  aba: AbaPca;
  children: ReactNode;
}) {
  return (
    <div className="space-y-[var(--gap-block)]">
      <Link href="/painel/pca" className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-text-2">
        <IconChevronLeft className="h-4 w-4" /> PCA
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-16 shrink-0 sm:w-20">
          <PcaCapa capa={pca.capa} ano={null} className="!rounded-xl" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 max-w-full truncate text-2xl font-black tracking-tight text-text sm:text-3xl">{pca.nome}</h1>
            <Badge tone={pca.status === "publicado" ? "emerald" : "amber"} dot>
              {ROTULO_STATUS[pca.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted">
            {ROTULO_FONTE[pca.fonte]} · ano {pca.ano ?? "—"}
          </p>
        </div>
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
