"use client";

import type { ReactNode } from "react";
import type { RegrasAvaliacao } from "@/lib/avaliacao-core";
import {
  ASSINATURA_ROTULO,
  type EstadoDfd,
  estadoCor,
  estadoRotulo,
  type GrupoAssinatura,
  type ResumoEstado,
} from "@/lib/dfd-tratamento";
import { brl, dataHoraBR, num } from "@/lib/format";
import { tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import type { DfdSobrescrito } from "@/lib/protocolo";
import { Badge, type Tone } from "./Badge";
import { type Column, DataTable } from "./DataTable";
import { EstadoPonto, EstadoProcessando, EstadoResumo } from "./EstadoCelula";
import { IconArrowRight } from "./icons";

/** Tom do Badge por tipo de assinatura: Centi=verde, Dropsigner=azul, Adobe=vermelho, Foxit=âmbar (OCR). */
const ASSINATURA_TONE: Record<GrupoAssinatura, Tone> = { centi: "emerald", dropsigner: "blue", adobe: "red", foxit: "amber", manual: "blue" };

/** O que o sistema está fazendo com a linha AGORA (feedback real, com spinner na célula "Estado"). */
export type ProcessandoDfd = "texto" | "ocr" | "fila" | "conferindo";
const PROCESSANDO_ROTULO: Record<ProcessandoDfd, string> = {
  texto: "Lendo o DFD…",
  ocr: "Lendo assinatura (OCR)…",
  fila: "Na fila",
  conferindo: "Conferindo…",
};

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
  /** Quem validou a assinatura: "auto" (o sistema conferiu) / "equipe" (validada à mão). */
  validacao?: "auto" | "equipe" | null;
  /** Em processamento (lendo o DFD / a assinatura por OCR / na fila / conferindo) — spinner na célula. */
  processando?: ProcessandoDfd | null;
  situacao?: string | null; // Novo/Substitui/Move (só na importação)
  protocolo?: string | null; // nº do processo (só na aba DFDs)
};

/**
 * Planilha de DFDs REUTILIZÁVEL — colunas (nessa ordem): [seleção] · Estado ·
 * [Situação] · Nº Plan. · Nº DFD · Sigla · Tipo · Assinatura · [Protocolo] · Itens · Valor total ·
 * [ações]. Todas filtráveis/ordenáveis e SEM quebra de linha (a coluna ganha a largura do
 * conteúdo; a tabela rola no eixo x do próprio container). Na ANÁLISE (importação) os **DFDs com
 * erro/atenção** ficam em **tabelas separadas** acima das regulares; depois de protocolado
 * (`unica`) é UMA tabela só (o filtro da coluna Estado separa). Rodapé = só os agregados das
 * linhas (nº · itens · valor). Colunas opcionais (Situação/Protocolo/ações) só aparecem quando há dado.
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
  scrollInterno = false,
  unica = false,
  regras,
  reservaInferior = 0,
  semEstado = false,
  acoesRodape,
  vazio,
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
  /** Scroll interno + seletor de linhas (30/50/100/200) na tabela REGULAR quando não há
   * sub-tabelas de erro/atenção (repassado ao `DataTable`). */
  scrollInterno?: boolean;
  /** Tabela ÚNICA (DFDs já protocolados): sem separar erro/atenção/regulares em tabelas diferentes. */
  unica?: boolean;
  /** Regras do ADM — cor/rótulo dos estados de ciclo seguem a configuração (fallback = tokens). */
  regras?: RegrasAvaliacao;
  /** Altura reservada no fim do display (barra de seleção fixa) — repassada ao `DataTable`. */
  reservaInferior?: number;
  /** Só DADOS (ex.: Dashboard do PCA): sem a coluna Estado — nenhum erro/atenção apontado; tabela única. */
  semEstado?: boolean;
  /** Ações no rodapé da tabela PRINCIPAL, à esquerda do seletor de linhas (ex.: "Importar DFD" da Mesa). */
  acoesRodape?: ReactNode;
  /** Mensagem do corpo da tabela principal sem nenhuma linha (repassada ao `DataTable`). */
  vazio?: ReactNode;
}) {
  const temSituacao = linhas.some((l) => l.situacao != null);
  const temProtocolo = linhas.some((l) => l.protocolo != null);

  const colEstado: Column<LinhaDfd>[] = semEstado
    ? []
    : [
    {
      key: "estado",
      header: "Estado",
      nowrap: true,
      value: (r) =>
        r.processando
          ? PROCESSANDO_ROTULO[r.processando]
          : r.estadoMotivo
            ? "Leitura incompleta"
            : r.resumo?.rotulo || estadoRotulo(r.estado, regras),
      // Filtro: TODOS os problemas da linha (inclusive os ocultos no "+N") — filtrar por um deles acha o DFD.
      valores: (r) =>
        r.processando
          ? [PROCESSANDO_ROTULO[r.processando]]
          : r.estadoMotivo
            ? ["Leitura incompleta"]
            : r.resumo?.rotulos?.length
              ? r.resumo.rotulos
              : [r.resumo?.rotulo || estadoRotulo(r.estado, regras)],
      render: (r) => {
        // Em processamento: spinner + O QUE está acontecendo (feedback real da análise/conferência).
        if (r.processando) return <EstadoProcessando rotulo={PROCESSANDO_ROTULO[r.processando]} fila={r.processando === "fila"} />;
        // Leitura incompleta (parse falhou) — mantém a mensagem própria.
        if (r.estadoMotivo) return <EstadoPonto cor="var(--danger)" rotulo="Leitura incompleta" title={r.estadoMotivo} />;
        // Com erro/atenção: aponta o problema PRINCIPAL + "+N" por severidade (tooltip = lista completa).
        if (r.resumo?.rotulo) return <EstadoResumo res={r.resumo} />;
        // Regular / Regularizado / Editado / Pendente — cor/rótulo seguem o ADM (fallback = tokens).
        return <EstadoPonto cor={estadoCor(r.estado, regras)} rotulo={estadoRotulo(r.estado, regras)} />;
      },
    },
      ];
  const cols: Column<LinhaDfd>[] = [
    ...colEstado,
    ...(temSituacao
      ? [
          {
            key: "situacao",
            header: "Situação",
            nowrap: true,
            // Filtro pela situação SEM a contagem ("Alterado (3)" → "Alterado"): uma opção pega todos os alterados.
            value: (r: LinhaDfd) => (r.situacao ?? "—").replace(/\s*\(\d+\)$/, ""),
            render: (r: LinhaDfd) => <span className="text-[12px] text-muted">{r.situacao ?? "—"}</span>,
          },
        ]
      : []),
    // Nº de PLANEJAMENTO primeiro, depois o Nº do DFD.
    {
      key: "planejamento",
      header: "Nº Plan.",
      nowrap: true,
      value: (r) => r.planejamento ?? "",
      render: (r) => <span className="font-mono text-[12px]">{r.planejamento || "—"}</span>,
    },
    {
      key: "numero",
      header: "Nº DFD",
      nowrap: true,
      value: (r) => r.numero,
      render: (r) => <span className="font-mono text-[12px]">{r.numero}</span>,
    },
    {
      key: "sigla",
      header: "Sigla",
      nowrap: true,
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
    { key: "tipo", header: "Tipo", nowrap: true, value: (r) => r.tipo ?? "—", render: (r) => <span className="text-[12px]">{r.tipo ?? "—"}</span> },
    {
      key: "assinatura",
      header: "Assinatura",
      nowrap: true,
      value: (r) =>
        `${(r.assinaturas ?? []).map((g) => ASSINATURA_ROTULO[g]).join(" ") || "—"}${r.validacao ? ` (${r.validacao})` : ""}`,
      render: (r) => {
        const gs = r.assinaturas ?? [];
        if (gs.length === 0) return <span className="text-faint">—</span>;
        return (
          <span className="inline-flex flex-nowrap items-center gap-1">
            {gs.map((g) => (
              <Badge key={g} tone={ASSINATURA_TONE[g]}>
                {ASSINATURA_ROTULO[g]}
              </Badge>
            ))}
            {r.validacao && (
              <span className="text-[11px] font-semibold" style={{ color: r.validacao === "auto" ? "var(--ok)" : "var(--info)" }}>
                ({r.validacao})
              </span>
            )}
          </span>
        );
      },
    },
    ...(temProtocolo
      ? [
          {
            key: "protocolo",
            header: "Protocolo",
            nowrap: true,
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
      nowrap: true,
      value: (r) => String(r.itens ?? ""),
      render: (r) => (r.itens == null ? <span className="text-faint">…</span> : num(r.itens)),
    },
    {
      key: "valor",
      header: "Valor total",
      align: "right",
      nowrap: true,
      filter: "range",
      numero: (r) => r.valor,
      render: (r) => (r.valor == null ? <span className="text-faint">…</span> : brl(r.valor)),
    },
    ...(acoes
      ? [{ key: "acoes", header: "", filter: "none" as const, nowrap: true, render: (r: LinhaDfd) => acoes(r) }]
      : []),
  ];

  const resumo = (l: LinhaDfd[]) => {
    const itens = l.reduce((s, r) => s + (r.itens ?? 0), 0);
    const valor = l.reduce((s, r) => s + (r.valor ?? 0), 0);
    return `${l.length} DFD${l.length === 1 ? "" : "s"} · ${num(itens)} ${itens === 1 ? "item" : "itens"} · ${brl(valor)}`;
  };

  const erro = linhas.filter((l) => l.estado === "erro");
  const atencao = linhas.filter((l) => l.estado === "atencao");
  // DFDs descartados pelo usuário (duplicado / mantido o já cadastrado) — não são gravados (tabela cinza à parte).
  const descartado = linhas.filter((l) => l.estado === "descartado");
  const ok = linhas.filter((l) => l.estado !== "erro" && l.estado !== "atencao" && l.estado !== "descartado");
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
    reservaInferior,
  } as const;

  // A tabela PRINCIPAL (a única, ou a dos regulares) leva as ações do rodapé e a mensagem de vazio.
  const principal = { ...comum, acoesRodape, vazio } as const;
  // Tabela ÚNICA (já protocolado): todas as linhas juntas — o filtro da coluna Estado separa.
  if (unica || semEstado) {
    if (scrollInterno) return <DataTable rows={linhas} scrollInterno {...principal} />;
    if (fillHeight) return <DataTable rows={linhas} fillHeight pageSize={12} {...principal} />;
    return <DataTable rows={linhas} pageSize={compacta ? 12 : 20} {...principal} />;
  }

  // Só há tabelas "extras" (erro/atenção) quando há linhas nesse estado → o título
  // "DFDs regulares" só aparece para separá-las de fato.
  const temExtras = erro.length > 0 || atencao.length > 0 || descartado.length > 0;
  return (
    <div className="space-y-[var(--gap-block)]">
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
        {scrollInterno && !temExtras ? (
          <DataTable rows={ok} scrollInterno {...principal} />
        ) : fillHeight && !temExtras ? (
          <DataTable rows={ok} fillHeight pageSize={12} {...principal} />
        ) : (
          <DataTable rows={ok} pageSize={compacta ? 12 : 20} {...principal} />
        )}
      </div>
      {descartado.length > 0 && (
        <div className="opacity-60">
          <h4 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold" style={{ color: "var(--faint)" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--faint)" }} />
            DFDs descartados ({num(descartado.length)}) — não serão gravados (duplicado ou mantido o já cadastrado)
          </h4>
          <DataTable rows={descartado} pageSize={compacta ? 8 : 12} {...comum} selectable={false} />
        </div>
      )}
    </div>
  );
}

/** "Sobrescrito pelo protocolo X" — o protocolo ATUAL do DFD (o último da cadeia); o DFD excluído depois ou
 * hoje sem protocolo não tem para onde ir. */
function destinoSobrescrito(s: DfdSobrescrito): string {
  if (s.dfdId == null) return "DFD excluído depois";
  return s.protocoloAtualNumero ? `Protocolo ${s.protocoloAtualNumero}` : "Hoje sem protocolo";
}

/**
 * RASTRO dos DFDs SOBRESCRITOS por outro protocolo — tabela CINZA, separada, abaixo dos DFDs do protocolo:
 * o retrato da versão que este protocolo tinha (planejamento/sigla/tipo/itens/valor NA ÉPOCA) e "Sobrescrito
 * pelo" = o protocolo ATUAL do DFD (sempre o último da cadeia A → B → C) — o link leva a ele (as linhas não
 * são clicáveis: sem acesso/DFD excluído não há destino). Os valores entram na conciliação da capa (a capa foi
 * emitida com eles).
 */
export function TabelaSobrescritos({
  sobrescritos,
  onVerProtocolo,
  compacta = false,
}: {
  sobrescritos: DfdSobrescrito[];
  /** Abre o protocolo ATUAL do DFD (a pilha de banners troca para ele). */
  onVerProtocolo?: (protocoloId: number) => void;
  compacta?: boolean;
}) {
  if (sobrescritos.length === 0) return null;
  const pode = (s: DfdSobrescrito) => !!onVerProtocolo && s.protocoloAtualId != null && s.acessivel !== false;
  const cols: Column<DfdSobrescrito>[] = [
    { key: "planejamento", header: "Nº Plan.", nowrap: true, value: (s) => s.planejamento ?? "", render: (s) => <span className="font-mono text-[12px]">{s.planejamento || "—"}</span> },
    { key: "numero", header: "Nº DFD", nowrap: true, value: (s) => s.numero, render: (s) => <span className="font-mono text-[12px]">{s.numero}</span> },
    { key: "sigla", header: "Sigla", nowrap: true, value: (s) => s.sigla ?? "—", render: (s) => <span className="font-mono text-[12px]">{s.sigla ?? "—"}</span> },
    { key: "tipo", header: "Tipo", nowrap: true, value: (s) => tipoCurtoDfd(s.tipo) ?? "—", render: (s) => <span className="text-[12px]">{tipoCurtoDfd(s.tipo) ?? "—"}</span> },
    {
      key: "destino",
      header: "Sobrescrito pelo",
      nowrap: true,
      value: (s) => destinoSobrescrito(s),
      render: (s) =>
        pode(s) ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (s.protocoloAtualId != null) onVerProtocolo?.(s.protocoloAtualId);
            }}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-control px-1 text-[12px] font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            title="Abrir o protocolo onde este DFD está agora"
          >
            {destinoSobrescrito(s)} <IconArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="text-[12px] text-muted" title={s.protocoloAtualId != null && s.acessivel === false ? "Protocolo de outra unidade (sem acesso)" : undefined}>
            {destinoSobrescrito(s)}
          </span>
        ),
    },
    {
      key: "em",
      header: "Em",
      filter: "none",
      nowrap: true,
      render: (s) => <span className="text-[12px] tabular-nums text-muted">{dataHoraBR(s.sobrescritoEm)}</span>,
    },
    { key: "itens", header: "Itens", align: "center", nowrap: true, value: (s) => String(s.totalItens ?? ""), render: (s) => num(s.totalItens ?? 0) },
    {
      key: "valor",
      header: "Valor (na época)",
      align: "right",
      nowrap: true,
      filter: "range",
      numero: (s) => s.valorTotal ?? 0,
      render: (s) => brl(s.valorTotal ?? 0),
    },
  ];
  return (
    <div className="opacity-70">
      <h4 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold" style={{ color: "var(--faint)" }}>
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--faint)" }} />
        DFDs sobrescritos por outro protocolo ({num(sobrescritos.length)}) — o retrato da versão deste processo
      </h4>
      <DataTable
        rows={sobrescritos}
        columns={cols}
        getKey={(s) => s.numero}
        minWidth={760}
        pageSize={compacta ? 8 : 12}
        resumo={(l) => `${l.length} DFD${l.length === 1 ? "" : "s"} sobrescrito${l.length === 1 ? "" : "s"} · ${brl(l.reduce((t, s) => t + (s.valorTotal ?? 0), 0))}`}
      />
    </div>
  );
}
