"use client";

import type { ReactNode } from "react";
import { ESTADO_ROTULO, type EstadoDfd, estadoCor } from "@/lib/dfd-tratamento";
import { brl, num } from "@/lib/format";
import { type Column, DataTable } from "./DataTable";

/**
 * Linha normalizada de um DFD para a **planilha única** (`PlanilhaDfds`) — o MESMO
 * componente de tabela em TODO lugar que lista DFDs: banner de importação do
 * protocolo, banner do protocolo gravado e a aba DFDs. Cada tela mapeia os seus
 * dados (parse do PDF, D1) para este modelo.
 */
export type LinhaDfd = {
  key: number; // idx (import) ou id do DFD (gravado)
  numero: string;
  planejamento: string | null;
  sigla: string; // código da repartição (ou sigla do setor)
  auto?: boolean; // repartição detectada automaticamente
  tipo: string | null; // código curto DFD-S/R/O/E (via tipoCurtoDfd) ou null
  itens: number | null; // null = ainda analisando ("…")
  valor: number | null;
  estado: EstadoDfd;
  estadoMotivo?: string | null; // ex.: "Leitura incompleta" (tooltip)
  situacao?: string | null; // Novo/Substitui/Move (só na importação)
  protocolo?: string | null; // nº do processo (só na aba DFDs)
};

/**
 * Planilha de DFDs REUTILIZÁVEL — colunas (nessa ordem): [seleção] · Estado ·
 * [Situação] · Nº DFD · Nº Plan. · Sigla · Tipo · [Protocolo] · Itens · Valor total ·
 * [ações]. Todas filtráveis/ordenáveis. Os **DFDs com erro** ficam numa **tabela
 * separada** acima da de regulares. Rodapé = só os agregados das linhas (nº · itens ·
 * valor). Colunas opcionais (Situação/Protocolo/ações) só aparecem quando há dado.
 */
export function PlanilhaDfds({
  linhas,
  selecionavel = false,
  selected,
  onSelected,
  onRowClick,
  acoes,
  compacta = false,
  fillHeight = false,
}: {
  linhas: LinhaDfd[];
  selecionavel?: boolean;
  selected?: Set<string | number>;
  onSelected?: (s: Set<string | number>) => void;
  onRowClick?: (key: number) => void;
  acoes?: (l: LinhaDfd) => ReactNode;
  compacta?: boolean;
  fillHeight?: boolean;
}) {
  const temSituacao = linhas.some((l) => l.situacao != null);
  const temProtocolo = linhas.some((l) => l.protocolo != null);

  const cols: Column<LinhaDfd>[] = [
    {
      key: "estado",
      header: "Estado",
      minWidth: 118,
      value: (r) => (r.estadoMotivo ? "Leitura incompleta" : ESTADO_ROTULO[r.estado]),
      render: (r) => (
        <span
          className="inline-flex items-center gap-1.5 text-[12px] font-medium"
          style={{ color: estadoCor(r.estado) }}
          title={r.estadoMotivo ?? undefined}
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: estadoCor(r.estado) }} />
          {r.estadoMotivo ? "Leitura incompleta" : ESTADO_ROTULO[r.estado]}
        </span>
      ),
    },
    ...(temSituacao
      ? [
          {
            key: "situacao",
            header: "Situação",
            minWidth: 86,
            value: (r: LinhaDfd) => r.situacao ?? "—",
            render: (r: LinhaDfd) => <span className="text-[12px] text-muted">{r.situacao ?? "—"}</span>,
          },
        ]
      : []),
    {
      key: "numero",
      header: "Nº DFD",
      value: (r) => r.numero,
      render: (r) => <span className="font-mono text-[12px]">{r.numero}</span>,
    },
    {
      key: "planejamento",
      header: "Nº Plan.",
      value: (r) => r.planejamento ?? "",
      render: (r) => <span className="font-mono text-[12px]">{r.planejamento || "—"}</span>,
    },
    {
      key: "sigla",
      header: "Sigla",
      value: (r) => r.sigla,
      render: (r) => (
        <span className="inline-flex items-center gap-1">
          <span className="font-mono text-[12px] font-semibold text-accent">{r.sigla}</span>
          {r.auto && (
            <span className="text-[9px] font-semibold uppercase text-accent" title="Detectada automaticamente">
              auto
            </span>
          )}
        </span>
      ),
    },
    { key: "tipo", header: "Tipo", value: (r) => r.tipo ?? "—", render: (r) => <span className="text-[12px]">{r.tipo ?? "—"}</span> },
    ...(temProtocolo
      ? [
          {
            key: "protocolo",
            header: "Protocolo",
            value: (r: LinhaDfd) => r.protocolo ?? "—",
            render: (r: LinhaDfd) =>
              r.protocolo ? (
                <span className="font-mono text-[12px]">{r.protocolo}</span>
              ) : (
                <span className="text-faint">—</span>
              ),
          },
        ]
      : []),
    {
      key: "itens",
      header: "Itens",
      align: "right",
      value: (r) => String(r.itens ?? ""),
      render: (r) => (r.itens == null ? <span className="text-faint">…</span> : num(r.itens)),
    },
    {
      key: "valor",
      header: "Valor total",
      align: "right",
      value: (r) => String(r.valor ?? ""),
      render: (r) => (r.valor == null ? <span className="text-faint">…</span> : brl(r.valor)),
    },
    ...(acoes
      ? [{ key: "acoes", header: "", filter: "none" as const, render: (r: LinhaDfd) => acoes(r) }]
      : []),
  ];

  const resumo = (l: LinhaDfd[]) => {
    const itens = l.reduce((s, r) => s + (r.itens ?? 0), 0);
    const valor = l.reduce((s, r) => s + (r.valor ?? 0), 0);
    return `${l.length} DFD${l.length === 1 ? "" : "s"} · ${num(itens)} ${itens === 1 ? "item" : "itens"} · ${brl(valor)}`;
  };

  const erro = linhas.filter((l) => l.estado === "erro");
  const atencao = linhas.filter((l) => l.estado === "atencao");
  const ok = linhas.filter((l) => l.estado !== "erro" && l.estado !== "atencao");
  const mw = temProtocolo ? 940 : 720;
  const comum = {
    columns: cols,
    getKey: (r: LinhaDfd) => r.key,
    selectable: selecionavel,
    selected,
    onSelected,
    onRowClick: onRowClick ? (r: LinhaDfd) => onRowClick(r.key) : undefined,
    minWidth: mw,
    resumo,
  } as const;

  // Só há tabelas "extras" (erro/atenção) quando há linhas nesse estado → o título
  // "DFDs regulares" só aparece para separá-las de fato.
  const temExtras = erro.length > 0 || atencao.length > 0;
  return (
    <div className="space-y-4">
      {erro.length > 0 && (
        <div>
          <h4 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold" style={{ color: "var(--danger)" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--danger)" }} />
            DFDs com erro ({num(erro.length)})
          </h4>
          <DataTable rows={erro} pageSize={compacta ? 8 : 12} {...comum} />
        </div>
      )}
      {atencao.length > 0 && (
        <div>
          <h4 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold" style={{ color: "var(--warn)" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--warn)" }} />
            DFDs em atenção ({num(atencao.length)})
          </h4>
          <DataTable rows={atencao} pageSize={compacta ? 8 : 12} {...comum} />
        </div>
      )}
      <div>
        {temExtras && <h4 className="mb-1.5 text-[13px] font-bold text-text">DFDs regulares ({num(ok.length)})</h4>}
        {fillHeight && !temExtras ? (
          <DataTable rows={ok} fillHeight pageSize={12} {...comum} />
        ) : (
          <DataTable rows={ok} pageSize={compacta ? 12 : 20} {...comum} />
        )}
      </div>
    </div>
  );
}
