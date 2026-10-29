"use client";

import type { ReactNode } from "react";
import type { FontePca, StatusPca } from "@/lib/pca-core";
import { AbasEspaco } from "./AbasEspaco";
import { IconSettings } from "./icons";
import { useOndeDetalhe } from "./CanalGrupo";

export type AbaPca = "dashboard" | "orcamento" | "mesa" | "importacao" | "documentos" | "declaracoes" | "configuracao";

/**
 * ESPAÇO do PCA (`/painel/pca/[id]`) — sem título (o nome do PCA está no caminho do cabeçalho): a PRIMEIRA linha é o voltar
 * à esquerda, as abas **Dashboard · Orçamento · Mesa|Importação · Documentos · Declarações · Configuração [ícone]** e as
 * ferramentas da aba (`AbasEspaco voltar` + `FerramentasAba`); o servidor monta SÓ a aba ativa.
 */
export function PcaEspacoView({
  pca,
  aba,
  permitidas,
  children,
}: {
  pca: { nome: string; ano: number | null; fonte: FontePca; status: StatusPca };
  /** A aba que o servidor montou (`children`). */
  aba: AbaPca;
  /** As abas que o papel vê (Detalhes do papel → Componentes); ausente = todas. */
  permitidas?: readonly AbaPca[];
  children: ReactNode;
}) {
  useOndeDetalhe(pca.nome);
  return (
    <div className="space-y-[var(--gap-block)]">
      <AbasEspaco<AbaPca>
        aba={aba}
        voltar={{ href: "/painel/pca", rotulo: "PCA" }}
        opcoes={([
          { value: "dashboard", label: "Dashboard" },
          { value: "orcamento", label: "Orçamento" },
          { value: "mesa", label: "Mesa" },
          ...(pca.fonte === "lista" ? [{ value: "importacao", label: "Importação" } as const] : []),
          { value: "documentos", label: "Documentos" },
          { value: "declaracoes", label: "Declarações" },
          { value: "configuracao", label: "Configuração", soIcone: true, icone: <IconSettings className="h-4 w-4" aria-hidden="true" /> },
        ] as const).filter((o) => !permitidas || permitidas.includes(o.value))}
      >
        {children}
      </AbasEspaco>
    </div>
  );
}
