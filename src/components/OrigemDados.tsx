"use client";

import type { ReactNode } from "react";
import { Callout } from "./Callout";
import { IconDatabase } from "./icons";
import { Modal } from "./Modal";
import { StatMini } from "./StatMini";

export type ResumoOrigem = { label: string; value: ReactNode; hint?: string };

/**
 * ORIGEM DOS DADOS — o banner padrão de "de onde vem este número": o que foi clicado (linha de tabela, fatia ou
 * barra de gráfico) em `StatMini`s, a FONTE num `Callout` e, no corpo, as linhas que formam o número (a tabela do
 * próprio sistema). Usado no Orçamento do PCA, nos gráficos do Dashboard e nas métricas das Integrações.
 */
export function OrigemDados({
  aberto,
  onClose,
  titulo,
  recorte,
  resumo,
  fonte,
  avisos,
  children,
}: {
  aberto: boolean;
  onClose: () => void;
  /** O que foi clicado (ex.: "Cronograma Mensal"). */
  titulo: string;
  /** O recorte clicado (ex.: "Mar/2026", a sigla da unidade). */
  recorte: string;
  resumo: ResumoOrigem[];
  /** De onde os dados são puxados. */
  fonte: ReactNode;
  /** Observações do recorte (ex.: itens anuais, teto da lista). */
  avisos?: ReactNode[];
  children: ReactNode;
}) {
  return (
    <Modal
      open={aberto}
      onClose={onClose}
      titulo={`Origem dos dados — ${titulo}`}
      size="xl"
      cabecalho={
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">Origem dos dados · {titulo}</p>
          <h2 className="truncate text-base font-bold text-text" title={recorte}>
            {recorte}
          </h2>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {resumo.map((r) => (
            <StatMini key={r.label} label={r.label} value={r.value} hint={r.hint} />
          ))}
        </div>
        <Callout kind="info" icon={<IconDatabase className="h-4 w-4" />}>
          {fonte}
        </Callout>
        {avisos?.filter(Boolean).map((a, i) => (
          <Callout key={i} kind="warn">
            {a}
          </Callout>
        ))}
        {children}
      </div>
    </Modal>
  );
}
