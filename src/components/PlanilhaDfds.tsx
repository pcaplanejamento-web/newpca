"use client";

import type { ReactNode } from "react";
import {
  ASSINATURA_ROTULO,
  ESTADO_ROTULO,
  type EstadoDfd,
  estadoCor,
  type GrupoAssinatura,
  type ResumoEstado,
} from "@/lib/dfd-tratamento";
import { brl, num } from "@/lib/format";
import { Badge, type Tone } from "./Badge";
import { type Column, DataTable } from "./DataTable";

/** Tom do Badge por tipo de assinatura: Centi=verde, Dropsigner=azul, Adobe=vermelho. */
const ASSINATURA_TONE: Record<GrupoAssinatura, Tone> = { centi: "emerald", dropsigner: "blue", adobe: "red" };

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
  /** Resumo do estado: erro/atenção ESPECÍFICO (rótulo curto) + contadores "+N" + tooltip. Ausente
   * ⇒ a célula usa o rótulo genérico do estado (Regular/Editado/…). */
  resumo?: ResumoEstado;
  /** Tipos de assinatura presentes no DFD (Centi/Dropsigner/Adobe) — coluna "Assinatura". */
  assinaturas?: GrupoAssinatura[];
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
  ativa = null,
  acoes,
  compacta = false,
  fillHeight = false,
}: {
  linhas: LinhaDfd[];
  selecionavel?: boolean;
  selected?: Set<string | number>;
  onSelected?: (s: Set<string | number>) => void;
  onRowClick?: (key: number) => void;
  /** DFD ATIVO (cujo banner está aberto ao lado) — linha destacada (mestre-detalhe). */
  ativa?: number | null;
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
      minWidth: 150,
      value: (r) => (r.estadoMotivo ? "Leitura incompleta" : r.resumo?.rotulo || ESTADO_ROTULO[r.estado]),
      render: (r) => {
        // Leitura incompleta (parse falhou) — mantém a mensagem própria.
        if (r.estadoMotivo)
          return (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--danger)" }} title={r.estadoMotivo}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--danger)" }} />
              Leitura incompleta
            </span>
          );
        // Com erro/atenção: aponta o problema PRINCIPAL (rótulo curto) + "+N" por severidade; o
        // `title` traz a lista completa (tooltip nativo, sem precisar abrir o DFD).
        const res = r.resumo;
        if (res?.rotulo)
          return (
            <span className="inline-flex items-center gap-1 text-[12px] font-medium" title={res.titulo || undefined}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: res.cor }} />
              <span style={{ color: res.cor }}>{res.rotulo}</span>
              {res.extraErros > 0 && <span className="font-bold" style={{ color: "var(--danger)" }}>+{res.extraErros}</span>}
              {res.extraAtencoes > 0 && <span className="font-bold" style={{ color: "var(--warn)" }}>+{res.extraAtencoes}</span>}
            </span>
          );
        // Regular / Regularizado / Editado / Pendente — inalterado.
        return (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: estadoCor(r.estado) }}>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: estadoCor(r.estado) }} />
            {ESTADO_ROTULO[r.estado]}
          </span>
        );
      },
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
      // A cor AZUL (accent) já denota unidade detectada automaticamente — sem o rótulo "auto".
      render: (r) => (
        <span
          className={`font-mono text-[12px] font-semibold ${r.auto ? "text-accent" : "text-text"}`}
          title={r.auto ? "Unidade detectada automaticamente" : undefined}
        >
          {r.sigla}
        </span>
      ),
    },
    { key: "tipo", header: "Tipo", value: (r) => r.tipo ?? "—", render: (r) => <span className="text-[12px]">{r.tipo ?? "—"}</span> },
    {
      key: "assinatura",
      header: "Assinatura",
      minWidth: 104,
      value: (r) => (r.assinaturas ?? []).map((g) => ASSINATURA_ROTULO[g]).join(" ") || "—",
      render: (r) => {
        const gs = r.assinaturas ?? [];
        if (gs.length === 0) return <span className="text-faint">—</span>;
        return (
          <span className="inline-flex flex-wrap gap-1">
            {gs.map((g) => (
              <Badge key={g} tone={ASSINATURA_TONE[g]}>
                {ASSINATURA_ROTULO[g]}
              </Badge>
            ))}
          </span>
        );
      },
    },
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
      align: "center",
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
  const mw = temProtocolo ? 1060 : 840;
  const comum = {
    columns: cols,
    getKey: (r: LinhaDfd) => r.key,
    selectable: selecionavel,
    selected,
    onSelected,
    onRowClick: onRowClick ? (r: LinhaDfd) => onRowClick(r.key) : undefined,
    activeKey: ativa,
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
