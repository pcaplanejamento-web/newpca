"use client";

import { useMemo } from "react";
import { dataBR, dataIsoBrasilia, num } from "@/lib/format";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import {
  COR_ESTADO_PRAZO,
  COR_PRIORIDADE,
  type EtiquetaTarefa,
  estadoPrazo,
  type ListaTarefas,
  PRIORIDADES,
  ROTULO_ESTADO_PRAZO,
  ROTULO_PRIORIDADE,
  ROTULO_VINCULO,
  rotuloRecorrencia,
  rotuloTicket,
  type TarefaResumo,
} from "@/lib/tarefas-core";
import { Avatar } from "./Avatar";
import { CelulaCopiavel } from "./BotaoCopiar";
import { type Column, DataTable, type EdicoesDaTabela } from "./DataTable";
import { IconBandeira, IconRepetir } from "./icons";

/**
 * A aba LISTA do quadro: as tarefas numa tabela (o padrão da Mesa — `scrollInterno`, compacta, filtro/ordem em todas as
 * colunas e as EDIÇÕES SALVAS: colunas, ordem e filtros, pessoais ou públicas). Tocar numa linha abre o detalhe.
 */
export function TabelaTarefas({
  tarefas,
  listas,
  etiquetas,
  pessoas,
  hoje,
  ativa,
  onAbrir,
  edicoes,
  selecao,
  onSelecao,
  reservaInferior = 0,
}: {
  tarefas: TarefaResumo[];
  /** TODAS as listas (inclusive arquivadas — o nome de qualquer cartão). */
  listas: ListaTarefas[];
  etiquetas: EtiquetaTarefa[];
  pessoas: Pessoa[];
  hoje: string;
  ativa: number | null;
  onAbrir: (id: number) => void;
  edicoes?: EdicoesDaTabela;
  /** Seleção (edição em massa) — sem ela, a tabela não seleciona. */
  selecao?: Set<number>;
  onSelecao?: (s: Set<number>) => void;
  /** Altura reservada no fim do display (a barra de seleção fixa). */
  reservaInferior?: number;
}) {
  const colunas = useMemo<Column<TarefaResumo>[]>(() => {
    const lista = new Map(listas.map((l) => [l.id, l]));
    const pessoa = new Map(pessoas.map((p) => [p.id, p]));
    const etiqueta = new Map(etiquetas.map((e) => [e.id, e]));
    const estado = (t: TarefaResumo) => estadoPrazo(t.prazo, hoje, t.concluidaEm != null);
    const responsaveis = (t: TarefaResumo) => t.pessoas.map((p) => pessoa.get(p)).filter((p): p is Pessoa => !!p);
    const marcas = (t: TarefaResumo) => t.etiquetas.map((e) => etiqueta.get(e)).filter((e): e is EtiquetaTarefa => !!e);
    return [
      {
        key: "ticket",
        header: "Ticket",
        nowrap: true,
        filter: "none",
        value: (t) => String(t.ticket).padStart(9, "0"),
        numero: (t) => t.ticket,
        render: (t) => (
          <span className="font-mono tabular-nums text-text-2">
            <CelulaCopiavel copiar={String(t.ticket)} rotulo="nº do ticket">
              {rotuloTicket(t.ticket)}
            </CelulaCopiavel>
          </span>
        ),
      },
      {
        key: "titulo",
        header: "Título",
        align: "left",
        minWidth: 260,
        value: (t) => t.titulo,
        render: (t) => (
          <span className={`line-clamp-1 font-medium text-text ${t.concluidaEm ? "line-through decoration-faint" : ""}`} title={t.titulo}>
            {t.titulo}
          </span>
        ),
      },
      { key: "lista", header: "Lista", nowrap: true, value: (t) => lista.get(t.listaId)?.nome ?? "—", render: (t) => lista.get(t.listaId)?.nome ?? "—" },
      {
        key: "prioridade",
        header: "Prioridade",
        nowrap: true,
        filterOptions: PRIORIDADES.map((p) => ROTULO_PRIORIDADE[p]),
        value: (t) => ROTULO_PRIORIDADE[t.prioridade],
        render: (t) => (
          <span className="inline-flex items-center gap-1 text-[12.5px] font-medium" style={{ color: COR_PRIORIDADE[t.prioridade] }}>
            <IconBandeira className="h-3.5 w-3.5" />
            {ROTULO_PRIORIDADE[t.prioridade]}
          </span>
        ),
      },
      {
        key: "situacao",
        header: "Prazo (situação)",
        nowrap: true,
        value: (t) => ROTULO_ESTADO_PRAZO[estado(t)],
        render: (t) => {
          const e = estado(t);
          return (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: COR_ESTADO_PRAZO[e] }}>
              <span className="h-2 w-2 rounded-full" style={{ background: COR_ESTADO_PRAZO[e] }} />
              {ROTULO_ESTADO_PRAZO[e]}
            </span>
          );
        },
      },
      { key: "prazo", header: "Prazo", nowrap: true, filter: "date", value: (t) => t.prazo ?? "", render: (t) => dataBR(t.prazo) },
      { key: "inicio", header: "Início", nowrap: true, filter: "date", value: (t) => t.inicio ?? "", render: (t) => dataBR(t.inicio) },
      {
        key: "responsaveis",
        header: "Responsáveis",
        nowrap: true,
        value: (t) => responsaveis(t).map((p) => nomeExibicao(p)).join(", ") || "Sem responsável",
        valores: (t) => {
          const r = responsaveis(t).map((p) => nomeExibicao(p));
          return r.length ? r : ["Sem responsável"];
        },
        render: (t) => {
          const r = responsaveis(t);
          if (!r.length) return <span className="text-faint">—</span>;
          return (
            <span className="inline-flex items-center gap-1.5" title={r.map((p) => nomeExibicao(p)).join(", ")}>
              <span className="flex -space-x-1.5">
                {r.slice(0, 3).map((p) => (
                  <Avatar key={p.id} nome={p.nome} foto={p.foto} size="xs" className="ring-2 ring-surface" />
                ))}
              </span>
              <span className="max-w-[10rem] truncate text-[12px] text-text-2">
                {nomeExibicao(r[0])}
                {r.length > 1 ? ` +${r.length - 1}` : ""}
              </span>
            </span>
          );
        },
      },
      {
        key: "etiquetas",
        header: "Etiquetas",
        nowrap: true,
        value: (t) => marcas(t).map((e) => e.nome).join(", "),
        valores: (t) => {
          const m = marcas(t).map((e) => e.nome);
          return m.length ? m : ["Sem etiqueta"];
        },
        render: (t) => (
          <span className="inline-flex gap-1">
            {marcas(t).map((e) => (
              <span key={e.id} className="rounded-full px-2 py-px text-[11px] font-semibold" style={{ color: e.cor, background: `color-mix(in srgb, ${e.cor} 14%, var(--surface))` }}>
                {e.nome}
              </span>
            ))}
          </span>
        ),
      },
      {
        key: "checklist",
        header: "Checklist",
        nowrap: true,
        filter: "range",
        formatarFaixa: (n) => `${Math.round(n)}%`,
        numero: (t) => (t.checklist.total ? (t.checklist.feitos / t.checklist.total) * 100 : null),
        value: (t) => (t.checklist.total ? `${t.checklist.feitos}/${t.checklist.total}` : ""),
        render: (t) =>
          t.checklist.total ? (
            <span className="tabular-nums" style={t.checklist.feitos === t.checklist.total ? { color: "var(--ok)" } : undefined}>
              {t.checklist.feitos}/{t.checklist.total}
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: "estimativa",
        header: "Estimativa (h)",
        nowrap: true,
        filter: "range",
        formatarFaixa: (n) => num(n),
        numero: (t) => t.estimativaH,
        value: (t) => (t.estimativaH == null ? "" : String(t.estimativaH)),
        render: (t) => (t.estimativaH == null ? <span className="text-faint">—</span> : num(t.estimativaH)),
      },
      {
        key: "vinculo",
        header: "Vínculo",
        nowrap: true,
        value: (t) => (t.vinculo ? `${ROTULO_VINCULO[t.vinculo.tipo]} ${t.vinculo.rotulo ?? `#${t.vinculo.id}`}` : "Sem vínculo"),
        render: (t) => (t.vinculo ? <span className="text-[12.5px] text-text-2">{`${ROTULO_VINCULO[t.vinculo.tipo]} ${t.vinculo.rotulo ?? `#${t.vinculo.id}`}`}</span> : <span className="text-faint">—</span>),
      },
      {
        key: "recorrencia",
        header: "Recorrência",
        nowrap: true,
        value: (t) => (t.recorrencia ? rotuloRecorrencia(t.recorrencia) : "Não se repete"),
        render: (t) =>
          t.recorrencia ? (
            <span className="inline-flex items-center gap-1 text-[12.5px] text-text-2">
              <IconRepetir className="h-3.5 w-3.5" />
              {rotuloRecorrencia(t.recorrencia)}
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: "criada",
        header: "Criada em",
        nowrap: true,
        filter: "date",
        value: (t) => dataIsoBrasilia(t.criadoEm),
        render: (t) => dataBR(dataIsoBrasilia(t.criadoEm)),
      },
      {
        key: "concluida",
        header: "Concluída em",
        nowrap: true,
        filter: "date",
        value: (t) => dataIsoBrasilia(t.concluidaEm),
        render: (t) => (t.concluidaEm ? dataBR(dataIsoBrasilia(t.concluidaEm)) : <span className="text-faint">—</span>),
      },
    ];
  }, [listas, pessoas, etiquetas, hoje]);

  return (
    <DataTable
      columns={colunas}
      rows={tarefas}
      getKey={(t) => t.id}
      onRowClick={(t) => onAbrir(t.id)}
      activeKey={ativa}
      scrollInterno
      density="compact"
      edicoes={edicoes}
      selectable={!!onSelecao}
      selected={selecao}
      onSelected={onSelecao ? (s) => onSelecao(new Set([...s].map(Number))) : undefined}
      reservaInferior={reservaInferior}
      vazio="Nenhuma tarefa — use “Adicionar tarefa” (aqui ou no pé de uma coluna do Quadro)."
      resumo={(linhas) => (
        <span>
          {num(linhas.length)} {linhas.length === 1 ? "tarefa" : "tarefas"}
        </span>
      )}
    />
  );
}
