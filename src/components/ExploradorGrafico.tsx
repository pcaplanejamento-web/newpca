"use client";

import { useMemo, useState } from "react";
import { brl, num } from "@/lib/format";
import { baixarPngGrafico } from "@/lib/exportar-grafico";
import { fatiasPequenas, type PontoSerie, rankingSerie, textoParticipacao } from "@/lib/ranking-grafico";
import { Button } from "./Button";
import { BarraSegmentada, BarrasH } from "./charts/Barras";
import { corSerie, useChartTokens } from "./charts/shared";
import { type Column, DataTable } from "./DataTable";
import { usePodeExportar } from "./ExportarTabelas";
import { IconFilter, IconImage, IconClose } from "./icons";
import { Modal } from "./Modal";
import { Segmented } from "./Segmented";
import { StatMini } from "./StatMini";
import { toast } from "./Toast";

type Linha = ReturnType<typeof rankingSerie>[number];

/**
 * EXPLORADOR de um gráfico (expandir — o "Chart Explorer"): o RANKING de todas as categorias por valor (as pequenas
 * também), tocar numa abre o CARTÃO do detalhe (valor, participação, posição "3º de 12" e a barra do quanto pesa) com
 * "Filtrar o Dashboard"; ou a TABELA (posição · categoria · itens · valor · %, com XLSX/PDF). PNG do ranking para quem
 * exporta. `corDe` = a cor da categoria (a MESMA do gráfico); `ativa` = a categoria filtrada no Dashboard.
 */
export function ExploradorGrafico({
  aberto,
  onClose,
  titulo,
  serie,
  medida,
  formatar,
  corDe,
  ativa,
  onFiltrar,
  recorte,
  modoInicial = "ranking",
}: {
  aberto: boolean;
  onClose: () => void;
  titulo: string;
  serie: PontoSerie[];
  /** O que o valor mede (o cabeçalho da coluna e o nome da medida). */
  medida: "valor" | "itens";
  formatar: (v: number) => string;
  /** O índice da cor da série de cada categoria (o MESMO do gráfico; -1 = neutra). Sem ele, o accent. */
  corDe?: (chave: string) => number;
  ativa?: string | null;
  /** Filtrar o Dashboard pela categoria (alternar). */
  onFiltrar?: (chave: string) => void;
  /** Os filtros já aplicados (texto do PNG e do subtítulo). */
  recorte?: string;
  modoInicial?: "ranking" | "tabela";
}) {
  const [modo, setModo] = useState<"ranking" | "tabela">(modoInicial);
  const [sel, setSel] = useState<string | null>(null);
  const tk = useChartTokens();
  const podeExportar = usePodeExportar();
  const ranking = useMemo(() => rankingSerie(serie), [serie]);
  const total = ranking.reduce((s, p) => s + p.valor, 0);
  const pequenas = fatiasPequenas(ranking);
  const escolhida = ranking.find((p) => p.chave === sel) ?? null;
  const indice = (chave: string) => corDe?.(chave);
  const cor = (chave: string) => {
    const i = indice(chave);
    return i == null ? "var(--accent)" : i < 0 ? "var(--faint)" : corSerie(i);
  };
  const corPng = (chave: string) => {
    const i = indice(chave);
    return i == null ? tk.accent : i < 0 ? tk.axis : tk.serie[i % tk.serie.length];
  };
  const temItens = ranking.some((p) => p.count != null);

  const colunas: Column<Linha>[] = [
    { key: "pos", header: "Posição", nowrap: true, total: false, filter: "range", formatarFaixa: num, numero: (p) => p.posicao, render: (p) => `${p.posicao}º` },
    { key: "rotulo", header: "Categoria", align: "left", minWidth: 200, value: (p) => p.rotulo, render: (p) => p.rotulo },
    ...(temItens
      ? [{ key: "count", header: "Itens", nowrap: true, filter: "range", formatarFaixa: num, numero: (p) => p.count ?? 0, render: (p) => num(p.count ?? 0) } as Column<Linha>]
      : []),
    {
      key: "valor",
      header: medida === "valor" ? "Valor" : "Itens",
      align: medida === "valor" ? "right" : "center",
      nowrap: true,
      filter: "range",
      formatarFaixa: medida === "valor" ? undefined : num,
      numero: (p) => p.valor,
      render: (p) => <span className="font-semibold tabular-nums">{medida === "valor" ? brl(p.valor) : num(p.valor)}</span>,
    },
    {
      key: "pct",
      header: "% do total",
      nowrap: true,
      total: false,
      filter: "range",
      formatarFaixa: (v) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
      numero: (p) => Math.round(p.participacao * 1000) / 10,
      render: (p) => textoParticipacao(p.participacao),
    },
  ];

  async function png() {
    try {
      await baixarPngGrafico(
        {
          titulo,
          subtitulo: [recorte, `Total: ${formatar(total)} · ${ranking.length} categorias`].filter(Boolean).join(" · "),
          linhas: ranking.map((p) => ({
            rotulo: p.rotulo,
            valor: p.valor,
            texto: formatar(p.valor),
            participacao: textoParticipacao(p.participacao),
            cor: corPng(p.chave),
          })),
          rodape: `Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
        },
        `${titulo.replace(/[^\p{L}\p{N} -]/gu, "").trim() || "grafico"}.png`,
        { texto: tk.texto, muted: tk.muted, fundo: tk.fundo, trilho: tk.cursor },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar a imagem.");
    }
  }

  return (
    <Modal
      open={aberto}
      onClose={onClose}
      titulo={titulo}
      size="xl"
      acoesCabecalho={
        podeExportar && modo === "ranking" ? (
          <Button size="sm" variant="ghost" onClick={png} title="Baixar o ranking como imagem (PNG)">
            <IconImage className="h-4 w-4" />
            <span className="hidden sm:inline">PNG</span>
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-[var(--gap-block)]">
        <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-3">
          <StatMini label="Total" value={formatar(total)} hint={recorte} />
          <StatMini label="Categorias" value={num(ranking.length)} />
          <StatMini
            label="Abaixo de 2%"
            value={num(pequenas)}
            tone={pequenas > 0 ? "warn" : "default"}
            hint={pequenas > 0 ? "aparecem no ranking — no gráfico ficam miúdas" : undefined}
            className="col-span-2 sm:col-span-1"
          />
        </div>
        <Segmented
          value={modo}
          onChange={setModo}
          ariaLabel="Modo do explorador"
          options={[
            { value: "ranking", label: "Ranking" },
            { value: "tabela", label: "Tabela" },
          ]}
        />
        <div key={modo} className="animate-cat-morph">
          {modo === "tabela" ? (
            <DataTable
              columns={colunas}
              rows={ranking}
              getKey={(p) => p.chave}
              density="compact"
              pageSize={20}
              exportar={{ nome: titulo }}
              resumo={(l) => `${l.length} categorias · ${formatar(l.reduce((s, p) => s + p.valor, 0))}`}
            />
          ) : (
            <div className="grid gap-[var(--gap-block)] lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="max-h-[60vh] overflow-y-auto pr-1">
                <BarrasH
                  ariaLabel={`Ranking — ${titulo}`}
                  ativa={sel}
                  acao="ver o detalhe"
                  onEscolher={(c) => setSel((a) => (a === c ? null : String(c)))}
                  linhas={ranking.map((p) => ({
                    chave: p.chave,
                    rotulo: (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="w-6 shrink-0 text-right text-[11px] text-faint tabular-nums">{p.posicao}º</span>
                        <span className="truncate">{p.rotulo}</span>
                      </span>
                    ),
                    titulo: `${p.rotulo}: ${formatar(p.valor)} (${textoParticipacao(p.participacao)})`,
                    segmentos: [{ chave: "v", valor: p.valor, cor: cor(p.chave), rotulo: p.rotulo }],
                    valor: formatar(p.valor),
                    detalhe: textoParticipacao(p.participacao),
                    apagada: ativa != null && ativa !== p.chave,
                    clicavel: true,
                  }))}
                />
              </div>
              <aside className="self-start rounded-card border border-border bg-surface-2 p-[var(--pad-card)]" aria-live="polite">
                {escolhida ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: cor(escolhida.chave) }} />
                      <span className="min-w-0 flex-1 text-sm font-semibold text-text">{escolhida.rotulo}</span>
                      <button
                        type="button"
                        aria-label="Fechar o detalhe"
                        onClick={() => setSel(null)}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-control text-muted hover:bg-surface pointer-coarse:h-11 pointer-coarse:w-11"
                      >
                        <IconClose className="h-4 w-4" />
                      </button>
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <dt className="text-muted">{medida === "valor" ? "Valor" : "Itens"}</dt>
                        <dd className="text-base font-bold text-text tabular-nums">{formatar(escolhida.valor)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Participação</dt>
                        <dd className="text-base font-bold text-text tabular-nums">{textoParticipacao(escolhida.participacao)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Posição</dt>
                        <dd className="font-semibold text-text tabular-nums">
                          {escolhida.posicao}º de {ranking.length}
                        </dd>
                      </div>
                      {escolhida.count != null && (
                        <div>
                          <dt className="text-muted">Itens</dt>
                          <dd className="font-semibold text-text tabular-nums">{num(escolhida.count)}</dd>
                        </div>
                      )}
                    </dl>
                    <BarraSegmentada
                      trilho
                      segmentos={[{ chave: "v", valor: escolhida.participacao, cor: cor(escolhida.chave), rotulo: escolhida.rotulo }]}
                      max={1}
                    />
                    {onFiltrar && (
                      <Button size="sm" variant={ativa === escolhida.chave ? "secondary" : "primary"} className="w-full" onClick={() => onFiltrar(escolhida.chave)}>
                        <IconFilter className="h-4 w-4" />
                        {ativa === escolhida.chave ? "Tirar o filtro" : "Filtrar o Dashboard"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted">Toque numa categoria para ver o valor, a participação e a posição dela.</p>
                )}
              </aside>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
