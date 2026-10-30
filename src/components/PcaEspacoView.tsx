"use client";

import type { ReactNode } from "react";
import { type FontePca, ROTULO_STATUS, type StatusPca } from "@/lib/pca-core";
import { AbasEspaco } from "./AbasEspaco";
import { Badge } from "./Badge";
import { IconCalendar, IconCheck } from "./icons";
import { useOndeDetalhe } from "./CanalGrupo";

export type AbaPca = "dashboard" | "orcamento" | "mesa" | "importacao" | "documentos" | "declaracoes" | "configuracao";

/**
 * ESPAÇO do PCA (`/painel/pca/[id]`) — sem título (o nome do PCA está no caminho do cabeçalho): a PRIMEIRA linha é o voltar
 * à esquerda, as abas **Dashboard · Orçamento · Mesa|Importação · Documentos · Declarações** e as ferramentas da aba;
 * à DIREITA, o ano e o status do PCA e, por último, a engrenagem da Configuração (`AbasEspaco voltar` + `FerramentasAba`); o servidor monta SÓ a aba ativa.
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
  const preview = pca.status === "preview";
  return (
    <div className="space-y-[var(--gap-block)]">
      <AbasEspaco<AbaPca>
        aba={aba}
        voltar={{ href: "/painel/pca", rotulo: "PCA" }}
        fim={
          <>
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
        opcoes={([
          { value: "dashboard", label: "Dashboard" },
          { value: "orcamento", label: "Orçamento" },
          { value: "mesa", label: "Mesa" },
          ...(pca.fonte === "lista" ? [{ value: "importacao", label: "Importação" } as const] : []),
          { value: "documentos", label: "Documentos" },
          { value: "declaracoes", label: "Declarações" },
          { value: "configuracao", label: "Configuração" },
        ] as const).filter((o) => !permitidas || permitidas.includes(o.value))}
      >
        {children}
      </AbasEspaco>
    </div>
  );
}
