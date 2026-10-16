"use client";

import { useUnidadeUnica } from "./UnidadeUnica";
import { useMemo } from "react";
import { dataBR, dataIsoBrasilia, num } from "@/lib/format";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import {
  siglasDaTarefa,
  type CampoTarefa,
  COR_ESTADO_PRAZO,
  COR_PRIORIDADE,
  type EquipeQuadro,
  type EtiquetaTarefa,
  estadoPrazo,
  type ListaTarefas,
  PRIORIDADES,
  ROTULO_ESTADO_PRAZO,
  ROTULO_PRIORIDADE,
  rotuloDoVinculo,
  rotuloRecorrencia,
  rotuloValorCampo,
  rotuloTicket,
  type TarefaResumo,
} from "@/lib/tarefas-core";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { AutomacoesMesa, useRodarAutomacao } from "./AutomacoesMesa";
import { Avatar } from "./Avatar";
import { toast } from "./Toast";
import { CelulaCopiavel } from "./BotaoCopiar";
import { CelulaLista } from "./CelulaLista";
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
  equipes = [],
  campos = [],
  pessoas,
  hoje,
  ativa,
  onAbrir,
  edicoes,
  selecao,
  onSelecao,
  reservaInferior = 0,
  nomeExportacao,
  automacoes = [],
}: {
  tarefas: TarefaResumo[];
  /** TODAS as listas (inclusive arquivadas — o nome de qualquer cartão). */
  listas: ListaTarefas[];
  etiquetas: EtiquetaTarefa[];
  /** As EQUIPES do quadro (a coluna "Equipes"). */
  equipes?: EquipeQuadro[];
  /** Os CAMPOS personalizados do quadro (uma coluna cada, no fim). */
  campos?: CampoTarefa[];
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
  /** O nome do arquivo do Exportar do rodapé (ex.: "Tarefas - Quadro X"). */
  nomeExportacao?: string;
  /** As AUTOMAÇÕES da Mesa (só o ADM): "Emitir DFDs" no rodapé, com os DFDs das tarefas À VISTA (os filtros valem). */
  automacoes?: { id: number; nome: string }[];
}) {
  // UMA unidade no cabeçalho e nenhuma tarefa ligada a OUTRA: a coluna Unidade sai.
  const unidadeCab = useUnidadeUnica("tarefas");
  const semUnidade = unidadeCab != null && tarefas.every((t) => siglasDaTarefa(t).every((sg) => sg === unidadeCab.sigla));
  const colunas = useMemo<Column<TarefaResumo>[]>(() => {
    const lista = new Map(listas.map((l) => [l.id, l]));
    const pessoa = new Map(pessoas.map((p) => [p.id, p]));
    const etiqueta = new Map(etiquetas.map((e) => [e.id, e]));
    const equipe = new Map(equipes.map((e) => [e.id, e]));
    const estado = (t: TarefaResumo) => estadoPrazo(t.prazo, hoje, t.concluidaEm != null);
    // Os ENVOLVIDOS: os responsáveis + os membros das equipes da tarefa.
    const responsaveis = (t: TarefaResumo) => t.envolvidos.map((p) => pessoa.get(p)).filter((p): p is Pessoa => !!p);
    const times = (t: TarefaResumo) => t.equipes.map((e) => equipe.get(e)).filter((e): e is EquipeQuadro => !!e);
    const marcas = (t: TarefaResumo) => t.etiquetas.map((e) => etiqueta.get(e)).filter((e): e is EtiquetaTarefa => !!e);
    return [
      {
        key: "ticket",
        header: "Ticket",
        nowrap: true,
        filter: "none",
        value: (t) => String(t.ticket).padStart(9, "0"),
        total: false, numero: (t) => t.ticket,
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
      { key: "prazo", header: "Prazo", nowrap: true, filter: "date", value: (t) => t.prazo ?? "", render: (t) => (t.prazo ? `${dataBR(t.prazo)}${t.prazoHora ? ` ${t.prazoHora}` : ""}` : dataBR(t.prazo)) },
      { key: "inicio", header: "Início", nowrap: true, filter: "date", value: (t) => t.inicio ?? "", render: (t) => dataBR(t.inicio) },
      {
        key: "unidade",
        header: "Unidade",
        nowrap: true,
        value: (t) => siglasDaTarefa(t).join(" · ") || "—",
        valores: (t) => {
          const sg = siglasDaTarefa(t);
          return sg.length ? sg : ["—"];
        },
        render: (t) => <CelulaLista valores={siglasDaTarefa(t)} max={2} />,
      },
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
      ...(equipes.length
        ? [
            {
              key: "equipes",
              header: "Equipes",
              nowrap: true,
              value: (t: TarefaResumo) => times(t).map((e) => e.nome).join(", "),
              valores: (t: TarefaResumo) => {
                const m = times(t).map((e) => e.nome);
                return m.length ? m : ["Sem equipe"];
              },
              render: (t: TarefaResumo) => (
                <span className="inline-flex gap-1">
                  {times(t).map((e) => (
                    <span key={e.id} className="rounded-chip px-2 py-px text-[11px] font-semibold" style={{ color: e.cor, background: `color-mix(in srgb, ${e.cor} 14%, var(--surface))` }}>
                      {e.nome}
                    </span>
                  ))}
                </span>
              ),
            } satisfies Column<TarefaResumo>,
          ]
        : []),
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
              <span key={e.id} className="rounded-chip px-2 py-px text-[11px] font-semibold" style={{ color: e.cor, background: `color-mix(in srgb, ${e.cor} 14%, var(--surface))` }}>
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
        total: false, numero: (t) => (t.checklist.total ? (t.checklist.feitos / t.checklist.total) * 100 : null),
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
        header: "Vínculos",
        nowrap: true,
        value: (t) => t.vinculos.map(rotuloDoVinculo).join("; ") || "Sem vínculo",
        valores: (t) => (t.vinculos.length ? t.vinculos.map(rotuloDoVinculo) : ["Sem vínculo"]),
        render: (t) => (t.vinculos.length ? <CelulaLista valores={t.vinculos.map(rotuloDoVinculo)} /> : <span className="text-faint">—</span>),
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
      ...campos.map(
        (c): Column<TarefaResumo> => ({
          key: `campo-${c.id}`,
          header: c.nome,
          nowrap: c.tipo !== "texto",
          align: c.tipo === "texto" ? "left" : "center",
          minWidth: c.tipo === "texto" ? 160 : undefined,
          ...(c.tipo === "data" ? { filter: "date" as const } : {}),
          ...(c.tipo === "numero" ? { filter: "range" as const, numero: (t: TarefaResumo) => (t.campos?.[c.id] ? Number(t.campos[c.id]) : null), formatarFaixa: (n: number) => num(n) } : {}),
          value: (t) => (c.tipo === "data" ? (t.campos?.[c.id] ?? "") : rotuloValorCampo(c, t.campos?.[c.id]) || "—"),
          render: (t) => {
            const v = rotuloValorCampo(c, t.campos?.[c.id]);
            return v ? (
              <span className="line-clamp-1" title={v}>
                {v}
              </span>
            ) : (
              <span className="text-faint">—</span>
            );
          },
        }),
      ),
    ];
  }, [listas, pessoas, etiquetas, equipes, campos, hoje]);

  return (
    <DataTable
      columns={semUnidade ? colunas.filter((c) => c.key !== "unidade") : colunas}
      rows={tarefas}
      getKey={(t) => t.id}
      exportar={nomeExportacao ? { nome: nomeExportacao } : undefined}
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
      acoesRodape={automacoes.length ? (linhas) => <EmitirDfdsTarefas tarefas={linhas} automacoes={automacoes} /> : undefined}
    />
  );
}

/** Os vínculos que levam a DFDs (o protocolo = todos os DFDs dele; o DFD; o item = o DFD dele). */
const TIPOS_DFD = new Set(["protocolo", "dfd", "item"]);

/**
 * EMITIR DFDs das tarefas À VISTA (os filtros da tabela e do quadro valem): escolhe a automação (só o ADM — as marcadas
 * "Disponível na Mesa"), resolve os DFDs dos vínculos no servidor e a roda em segundo plano — a MESMA saída da Mesa.
 */
function EmitirDfdsTarefas({ tarefas, automacoes }: { tarefas: TarefaResumo[]; automacoes: { id: number; nome: string }[] }) {
  const rodar = useRodarAutomacao();
  const vinculos = [...new Map(tarefas.flatMap((t) => t.vinculos.filter((v) => TIPOS_DFD.has(v.tipo)).map((v) => [`${v.tipo}:${v.id}`, { tipo: v.tipo, id: v.id }] as const))).values()];
  const comDfd = tarefas.filter((t) => t.vinculos.some((v) => TIPOS_DFD.has(v.tipo))).length;
  if (!comDfd) return null;
  return (
    <AutomacoesMesa
      variante="selecao"
      rotulo="Emitir DFDs"
      automacoes={automacoes}
      alvo={`${num(comDfd)} tarefa(s) à vista com DFD`}
      onEscolher={async (fluxoId) => {
        try {
          const { dfds } = await chamar<{ dfds: { id: number; numero: string; planejamento: string }[] }>("/api/tarefas/dfds", "POST", { vinculos });
          rodar(fluxoId, dfds);
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    />
  );
}
