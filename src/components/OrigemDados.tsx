"use client";

import type { ReactNode } from "react";
import { Avisos } from "./Avisos";
import { Modal, type ModalPainel } from "./Modal";
import { StatMini } from "./StatMini";

export type ResumoOrigem = { label: string; value: ReactNode; hint?: string; tone?: "default" | "accent" | "ok" | "warn" | "danger" };

/**
 * ORIGEM DOS DADOS — o banner padrão de "de onde vem este número": o que foi clicado (linha de tabela, fatia ou
 * barra de gráfico) em `StatMini`s e, no corpo, as linhas que formam o número (a tabela do próprio sistema). A FONTE e as
 * observações ficam no (!) do cabeçalho (`Avisos`) — nada de faixas que empurram a tabela. Usado no Orçamento do PCA, nos gráficos do Dashboard e nas métricas das Integrações.
 */
export function OrigemDados({
  aberto,
  onClose,
  titulo,
  recorte,
  resumo,
  fonte,
  avisos,
  paineis,
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
  /** Os banners que abrem AO LADO a partir das linhas (a pilha padrão — ex.: o empenho e a liquidação dele). */
  paineis?: ModalPainel[];
  children: ReactNode;
}) {
  return (
    <Modal
      open={aberto}
      onClose={onClose}
      titulo={`Origem dos dados — ${titulo}`}
      size="xl"
      paineis={paineis}
      larguraPrincipal={paineis?.some((x) => x.aberto) ? 60 : undefined}
      acoesCabecalho={
        <Avisos
          titulo="Sobre estes dados"
          avisos={[
            { id: "fonte", tom: "info" as const, texto: fonte },
            ...(avisos ?? []).filter(Boolean).map((a, i) => ({ id: `aviso-${i}`, tom: "warn" as const, texto: a })),
          ]}
        />
      }
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]">
          {resumo.map((r) => (
            <StatMini key={r.label} label={r.label} value={r.value} hint={r.hint} tone={r.tone} />
          ))}
        </div>
        {children}
      </div>
    </Modal>
  );
}
