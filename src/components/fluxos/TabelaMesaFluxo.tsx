"use client";

import { type ReactNode, useMemo } from "react";
import type { ProtocoloAutomacao } from "@/lib/automacao-centi-core";
import type { Item } from "@/lib/fluxo-core";
import { type AberturaItem, aberturaDoItem, dadosDfdDoItem, type TipoItemMesa, tipoDosItens } from "@/lib/fluxo-tipo-item";
import { COLUNAS_PROTOCOLOS, type GestaoAutomacao, useColunasGestao } from "../automacao/ProtocolosAutomacao";
import { colunasItemMesa, type LinhaItemMesa } from "../ColunasItensMesa";
import { type Column, DataTable } from "../DataTable";
import { type LinhaDfd, PlanilhaDfds } from "../PlanilhaDfds";

type Chave = string | number;

/** Leva colunas de um ITEM (ex.: o Estado/Detalhe da análise) para uma tabela cujas linhas são outra forma do mesmo item. */
function adaptar<R>(cols: Column<Item>[], item: (r: R) => Item): Column<R>[] {
  return cols.map((c) => ({
    ...c,
    value: c.value && ((r: R) => (c.value as (x: Item) => string)(item(r))),
    valores: c.valores && ((r: R) => (c.valores as (x: Item) => string[])(item(r))),
    numero: c.numero && ((r: R) => (c.numero as (x: Item) => number | null | undefined)(item(r))),
    render: c.render && ((r: R) => (c.render as (x: Item) => ReactNode)(item(r))),
    corPdf: c.corPdf && ((r: R) => (c.corPdf as (x: Item) => string | null | undefined)(item(r))),
  }));
}

/**
 * A tabela dos itens de uma AUTOMAÇÃO no padrão da MESA: protocolos, DFDs e itens com as MESMAS colunas e componentes da Mesa
 * (`COLUNAS_PROTOCOLOS` + a gestão, `PlanilhaDfds`, `colunasItemMesa`) e o toque na linha abre a MESMA pilha de banners
 * (`onAbrir` → `BannersMesa`). Outros dados (repartições, linhas da CM002…) seguem nas colunas `genericas`.
 */
export function TabelaMesaFluxo({
  itens,
  chave,
  genericas,
  extras = [],
  gestao,
  onAbrir,
  selected,
  onSelected,
  vazio,
  acoesRodape,
  resumo,
  exportar,
  onRowClick,
  scrollInterno = true,
  linhasSalvas,
}: {
  itens: Item[];
  /** A chave de cada linha (a mesma da seleção). */
  chave: (it: Item) => Chave;
  /** As colunas para os itens que não são protocolo/DFD/item. */
  genericas: Column<Item>[];
  /** Colunas a mais no fim, em qualquer tipo (ex.: Estado e Detalhe da análise ao vivo). */
  extras?: Column<Item>[];
  gestao: GestaoAutomacao;
  /** Abre o banner do protocolo/DFD/item na pilha da Mesa. */
  onAbrir?: (a: AberturaItem) => void;
  /** Seleção (a aba Seleção); sem ela, a tabela só lista. */
  selected?: Set<Chave>;
  onSelected?: (s: Set<Chave>) => void;
  vazio?: ReactNode;
  acoesRodape?: ReactNode;
  resumo?: (linhas: Item[]) => ReactNode;
  exportar?: { nome: string } | false;
  /** O toque na linha quando os itens NÃO são da Mesa (ex.: a análise de um protocolo lido). */
  onRowClick?: (it: Item) => void;
  /** No desktop, até o fim do display com rolagem interna (padrão); `false` = a tabela segue o conteúdo. */
  scrollInterno?: boolean;
  /** As linhas por página guardadas no aparelho (a chave). */
  linhasSalvas?: string;
}) {
  const tipo: TipoItemMesa | null = useMemo(() => tipoDosItens(itens), [itens]);
  const colGestao = useColunasGestao(gestao);
  const abrir = onAbrir ? (it: Item) => {
    const a = aberturaDoItem(it);
    if (a) onAbrir(a);
  } : undefined;
  const comum = { selectable: !!onSelected, selected, onSelected, acoesRodape, vazio, exportar, density: "compact", scrollInterno, linhasSalvas } as const;

  // DFDs: a PLANILHA DE DFDs da Mesa (a chave da linha = a posição; a seleção traduz para a chave do item).
  const dfds = useMemo(() => (tipo === "dfd" ? itens.map((it, i): LinhaDfd => ({ ...dadosDfdDoItem(it), key: i, estado: "regular" })) : []), [tipo, itens]);
  if (tipo === "dfd") {
    const chaves = itens.map(chave);
    const indice = new Map(chaves.map((k, i) => [String(k), i]));
    return (
      <PlanilhaDfds
        linhas={dfds}
        semEstado
        scrollInterno={scrollInterno}
        selecionavel={!!onSelected}
        selected={selected && new Set([...selected].map((k) => indice.get(String(k))).filter((i): i is number => i != null))}
        onSelected={onSelected && ((s) => onSelected(new Set([...s].map((i) => chaves[Number(i)]))))}
        onRowClick={abrir && ((i) => abrir(itens[i]))}
        colunasExtras={adaptar(extras, (r: LinhaDfd) => itens[r.key])}
        acoesRodape={acoesRodape}
        vazio={vazio}
        exportar={exportar}
      />
    );
  }
  if (tipo === "protocolo")
    return (
      <DataTable<Item>
        {...comum}
        columns={[...(colGestao as unknown as Column<Item>[]), ...(COLUNAS_PROTOCOLOS as unknown as Column<Item>[]), ...extras]}
        rows={itens as unknown as (ProtocoloAutomacao & Item)[]}
        getKey={chave}
        onRowClick={abrir}
        resumo={resumo}
      />
    );
  if (tipo === "item") {
    const c = colunasItemMesa<LinhaItemMesa>();
    const cols = [c.protocolo, c.planejamento, c.dfd, c.sigla, c.tipo, c.item, c.codigo, c.descricao, c.unidade, c.qtd, c.vunit, c.vtotal] as unknown as Column<Item>[];
    return <DataTable<Item> {...comum} columns={[...cols, ...extras]} rows={itens} getKey={chave} onRowClick={abrir} resumo={resumo} />;
  }
  return <DataTable<Item> {...comum} columns={[...genericas, ...extras]} rows={itens} getKey={chave} onRowClick={onRowClick} resumo={resumo} />;
}
