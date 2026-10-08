"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { type FontePca, ROTULO_STATUS, type StatusPca } from "@/lib/pca-core";
import { AbasEspaco } from "./AbasEspaco";
import { Badge } from "./Badge";
import { IconCalendar, IconCheck, IconChevronLeft, IconSettings } from "./icons";
import { useOndeDetalhe } from "./CanalGrupo";

export type AbaPca = "dashboard" | "orcamento" | "mesa" | "configuracao";

/**
 * ESPAÇO do PCA (`/painel/pca/[id]`) — enxuto como a tela do orçamento, usando a largura toda: UMA linha (voltar · nome ·
 * ano · status, à esquerda; as ferramentas da aba e as abas **Dashboard · Orçamento · Mesa|Importação · Configuração [ícone]**,
 * à direita — `AbasEspaco cabecalho` + `FerramentasAba`; o servidor monta SÓ a aba ativa). O Preview PULSA (ao vivo: o PCA
 * ainda em preparação). A capa fica no card e na Configuração.
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
  useOndeDetalhe(pca.nome);
  const preview = pca.status === "preview";
  return (
    <div className="space-y-[var(--gap-block)]">
      <AbasEspaco<AbaPca>
        aba={aba}
        cabecalho={
          <>
            <Link
              href="/painel/pca"
              aria-label="Voltar para PCA"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-text lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
            >
              <IconChevronLeft className="h-4 w-4" />
            </Link>
            <h1 className="min-w-0 truncate text-lg font-bold leading-[44px] text-text lg:leading-[var(--h-control-sm)]" title={pca.nome}>
              {pca.nome}
            </h1>
            {pca.ano != null && (
              <Badge tone="blue" tamanho="linha" title={`PCA ${pca.ano}`} className="shrink-0 tabular-nums">
                <IconCalendar className="h-3.5 w-3.5" aria-hidden="true" />
                {pca.ano}
              </Badge>
            )}
            <Badge
              tone={preview ? "amber" : "emerald"}
              dot
              vivo={preview}
              tamanho="linha"
              className="shrink-0"
              title={preview ? "Em preparação — os números ainda podem mudar e o PCA não aparece na tela inicial" : "Publicado na tela inicial"}
            >
              {!preview && <IconCheck className="h-3.5 w-3.5" aria-hidden="true" />}
              {ROTULO_STATUS[pca.status]}
            </Badge>
          </>
        }
        opcoes={[
          { value: "dashboard", label: "Dashboard" },
          { value: "orcamento", label: "Orçamento" },
          { value: "mesa", label: pca.fonte === "lista" ? "Importação" : "Mesa" },
          { value: "configuracao", label: "Configuração", soIcone: true, icone: <IconSettings className="h-4 w-4" aria-hidden="true" /> },
        ]}
      >
        {children}
      </AbasEspaco>
    </div>
  );
}
