"use client";

import type { ItemDfdRow } from "@/lib/dfd";
import { brl, num, numeroSemAno } from "@/lib/format";
import { CelulaCopiavel } from "./BotaoCopiar";
import { CelulaTexto } from "./CelulaLista";
import type { Column } from "./DataTable";
import { colunaPlanejamento, colunaTipoDfd } from "./PlanilhaDfds";

/** As linhas que essas colunas mostram: o item da Mesa (`ItemDfdRow`) ou o que o tem (a seleção das automações). */
export type LinhaItemMesa = Pick<
  ItemDfdRow,
  "protocoloNumero" | "dfdPlanejamento" | "dfdNumero" | "sigla" | "dfdTipo" | "item" | "codigo" | "descricao" | "unidade" | "quantidade" | "valorUnitario" | "valorTotal"
>;

/** O valor de FILTRO de cada coluna (a Mesa passa os seus — os MESMOS das visões Normal e Consolidada). */
type Valores<R> = Partial<Record<"protocolo" | "dfd" | "sigla" | "descricao" | "unidade", (r: R) => string>>;

/**
 * As colunas de DADOS de um item, as MESMAS da visão Itens da Mesa — usadas pela Mesa (`DfdsView`, que acrescenta Estado,
 * PCA, Prioridade, Catálogo, Classificação e Histórico) e pelas tabelas das automações. Devolve por chave: quem usa monta a
 * ordem.
 */
export function colunasItemMesa<R extends LinhaItemMesa>(valores: Valores<R> = {}) {
  return {
    protocolo: {
      key: "protocolo",
      header: "Protocolo",
      nowrap: true,
      value: valores.protocolo ?? ((r) => r.protocoloNumero ?? "—"),
      render: (r) =>
        r.protocoloNumero ? (
          <CelulaCopiavel copiar={numeroSemAno(r.protocoloNumero)} rotulo="nº do protocolo">
            <span className="font-mono text-[12px]">{r.protocoloNumero}</span>
          </CelulaCopiavel>
        ) : (
          <span className="text-faint">—</span>
        ),
    } as Column<R>,
    planejamento: colunaPlanejamento((r: R) => r.dfdPlanejamento),
    dfd: {
      key: "dfd",
      header: "Nº DFD",
      nowrap: true,
      value: valores.dfd ?? ((r) => r.dfdNumero),
      render: (r) => (
        <CelulaCopiavel copiar={r.dfdNumero} rotulo="nº do DFD">
          <span className="font-mono text-[12px]">{r.dfdNumero}</span>
        </CelulaCopiavel>
      ),
    } as Column<R>,
    sigla: {
      key: "sigla",
      header: "Sigla",
      nowrap: true,
      value: valores.sigla ?? ((r) => r.sigla ?? "—"),
      render: (r) => (r.sigla ? <span className="font-mono text-[12px] font-semibold text-accent">{r.sigla}</span> : <span className="text-faint">—</span>),
    } as Column<R>,
    tipo: colunaTipoDfd((r: R) => r.dfdTipo),
    item: { key: "item", header: "Item", align: "center", nowrap: true, value: (r) => String(r.item ?? ""), render: (r) => r.item ?? "—" } as Column<R>,
    codigo: {
      key: "codigo",
      header: "Código",
      nowrap: true,
      value: (r) => r.codigo ?? "",
      render: (r) => (
        <CelulaCopiavel copiar={r.codigo} rotulo="código do item">
          <span className="font-mono text-[12px]">{r.codigo ?? "—"}</span>
        </CelulaCopiavel>
      ),
    } as Column<R>,
    descricao: {
      key: "descricao",
      header: "Descrição",
      minWidth: 260,
      value: valores.descricao ?? ((r) => r.descricao ?? ""),
      // Uma linha só (a linha da tabela tem altura fixa); o texto inteiro na dica, no banner do item e com os DADOS COMPLETOS.
      render: (r) => (
        <CelulaCopiavel copiar={r.descricao} rotulo="descrição do item">
          <CelulaTexto texto={r.descricao} />
        </CelulaCopiavel>
      ),
    } as Column<R>,
    unidade: { key: "unidade", header: "Unidade", nowrap: true, value: valores.unidade ?? ((r) => r.unidade ?? "—"), render: (r) => r.unidade ?? "—" } as Column<R>,
    qtd: { key: "qtd", header: "Qtd.", align: "center", nowrap: true, value: (r) => String(r.quantidade ?? ""), render: (r) => (r.quantidade != null ? num(r.quantidade) : "—") } as Column<R>,
    vunit: { key: "vunit", header: "Vlr. unit.", align: "right", filter: "range", nowrap: true, total: false, numero: (r) => r.valorUnitario, render: (r) => (r.valorUnitario != null ? brl(r.valorUnitario) : "—") } as Column<R>,
    vtotal: { key: "vtotal", header: "Vlr. total", align: "right", filter: "range", nowrap: true, numero: (r) => r.valorTotal, render: (r) => (r.valorTotal != null ? brl(r.valorTotal) : "—") } as Column<R>,
  };
}
