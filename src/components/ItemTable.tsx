"use client";

import { type ReactNode, useMemo, useState } from "react";
import { brl, dataBR, dec, numeroSemAno } from "@/lib/format";
import type { ItemRow } from "@/lib/queries";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { CelulaCopiavel } from "./BotaoCopiar";
import { CelulaTexto } from "./CelulaLista";
import { type Column, DataTable } from "./DataTable";
import { SearchField } from "./Field";

/**
 * Tabela de ITENS do Dashboard do PCA (painel e tela inicial) — o MESMO `DataTable` das demais telas: TODAS as
 * colunas filtráveis/ordenáveis (facetas conectadas; o Seq. em LISTA com busca; faixa nas quantidades/R$; período na
 * data), sem quebra nos dados curtos, linha compacta e busca por produto/código/protocolo/DFD (vários com ":"). Com
 * `origem` (PCA de fonte protocolo) mostra o Protocolo/DFD de cada item — só quando algum item os tem — e a linha abre o banner do item (`onRowClick`/`ativo`).
 * Só dados — nenhum estado/erro de protocolo, DFD ou item é apontado aqui. Linhas na altura padrão (o produto em UMA
 * linha, inteiro na dica). A busca fica numa barra de UMA linha (`fim` = ao lado, ex.: o (?)); com `busca`, quem usa a
 * controla e a põe na barra dele (a Consulta do PCA: abas + busca + (?) na mesma linha).
 */
export function ItemTable({
  rows,
  showUnidade,
  origem = false,
  onRowClick,
  ativo = null,
  busca,
  semBusca = false,
  fim,
  alturaCheia,
}: {
  rows: ItemRow[];
  showUnidade: boolean;
  /** Colunas Protocolo · Nº DFD (itens vindos de DFDs). */
  origem?: boolean;
  onRowClick?: (r: ItemRow) => void;
  /** Item cujo banner está aberto (linha destacada). */
  ativo?: number | null;
  /** Busca CONTROLADA por quem usa (que a desenha na barra dela) — sem ela, a tabela traz a própria barra. */
  busca?: string;
  /** Sem busca nenhuma (a tela pública pesquisa pelo cabeçalho): a barra fica só com o `fim`. */
  semBusca?: boolean;
  /** Na barra da própria tabela, depois da busca (ex.: o (?)). */
  fim?: ReactNode;
  /** A tabela ocupa até o fim do display (rola por dentro) — a vista Consulta de itens. */
  alturaCheia?: boolean;
}) {
  const [qLocal, setQ] = useState("");
  const q = busca ?? qLocal;

  const filtradas = useMemo(() => {
    const casa = predicadoBusca(q); // vários de uma vez com ":"
    return casa ? rows.filter((r) => casa([r.nomeProduto, r.idProduto, r.protocoloNumero, r.dfdNumero])) : rows;
  }, [rows, q]);

  const temDominio = useMemo(() => rows.some((r) => r.dominio), [rows]);
  // Protocolo · Nº DFD · Tipo só quando algum item vem de DFD (um PCA só de planilhas não mostra colunas de "—").
  const temOrigem = useMemo(() => origem && rows.some((r) => r.protocoloNumero || r.dfdNumero), [origem, rows]);
  const colunas = useMemo<Column<ItemRow>[]>(() => {
    const cols: Column<ItemRow>[] = [
      {
        key: "seq",
        header: "Seq.",
        nowrap: true,
        // Lista com busca (vários com ":"); a ordem segue numérica pelo `numero`.
        total: false,
        value: (r) => (r.sequencial != null ? String(r.sequencial) : "—"),
        numero: (r) => r.sequencial,
        render: (r) => <span className="tabular-nums text-faint">{r.sequencial ?? "—"}</span>,
      },
    ];
    if (temOrigem)
      cols.push(
        {
          key: "protocolo",
          header: "Protocolo",
          nowrap: true,
          value: (r) => r.protocoloNumero ?? "—",
          render: (r) =>
            r.protocoloNumero ? (
              <CelulaCopiavel copiar={numeroSemAno(r.protocoloNumero)} rotulo="nº do protocolo">
                <span className="font-mono text-[12px]">{r.protocoloNumero}</span>
              </CelulaCopiavel>
            ) : (
              <span className="text-faint">—</span>
            ),
        },
        {
          key: "dfd",
          header: "Nº DFD",
          nowrap: true,
          value: (r) => r.dfdNumero ?? "—",
          render: (r) =>
            r.dfdNumero ? (
              <CelulaCopiavel copiar={r.dfdNumero} rotulo="nº do DFD">
                <span className="font-mono text-[12px]">{r.dfdNumero}</span>
              </CelulaCopiavel>
            ) : (
              <span className="text-faint">—</span>
            ),
        },
      );
    cols.push(
      {
        key: "codigoProduto",
        header: "Código",
        nowrap: true,
        value: (r) => r.idProduto ?? "",
        render: (r) => (
          <CelulaCopiavel copiar={r.idProduto} rotulo="código do item">
            <span className="font-mono text-[12px]">{r.idProduto ?? "—"}</span>
          </CelulaCopiavel>
        ),
      },
      {
        key: "nome",
        header: "Produto",
        align: "left",
        minWidth: 260,
        value: (r) => r.nomeProduto ?? "",
        render: (r) => (
          <CelulaCopiavel copiar={r.nomeProduto} rotulo="descrição do item">
            <span className="font-medium text-text">
              <CelulaTexto texto={r.nomeProduto} />
            </span>
          </CelulaCopiavel>
        ),
      },
      ...(temOrigem
        ? [
            {
              key: "tipoDfd",
              header: "Tipo",
              nowrap: true,
              value: (r: ItemRow) => r.tipoDfd ?? "—",
              render: (r: ItemRow) => (r.tipoDfd ? <span className="text-xs text-text-2">{r.tipoDfd}</span> : <span className="text-faint">—</span>),
            },
          ]
        : []),
      {
        key: "classificacao",
        header: "Classificação",
        nowrap: true,
        value: (r) => r.classificacao ?? "",
        render: (r) => <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-xs text-text-2">{r.classificacao ?? "—"}</span>,
      },
    );
    if (temDominio)
      cols.push({
        key: "dominio",
        header: "Domínio",
        nowrap: true,
        value: (r) => r.dominio ?? "—",
        render: (r) => <span className="text-xs text-text-2">{r.dominio ?? "—"}</span>,
      });
    if (showUnidade)
      cols.push({
        key: "codigo",
        header: "Unidade",
        nowrap: true,
        value: (r) => r.codigo ?? "",
        render: (r) => <span className="font-mono text-[12px] font-semibold text-text-2">{r.codigo ?? "—"}</span>,
      });
    cols.push(
      {
        key: "medida",
        header: "Medida",
        nowrap: true,
        value: (r) => r.unidadeMedida ?? "",
        render: (r) => <span className="text-muted">{r.unidadeMedida ?? "—"}</span>,
      },
      {
        key: "qtd",
        header: "Qtd.",
        nowrap: true,
        filter: "range",
        formatarFaixa: dec,
        numero: (r) => r.quantidade,
        render: (r) => <span className="tabular-nums text-text-2">{r.quantidade != null ? dec(r.quantidade) : "—"}</span>,
      },
      {
        key: "vlrRef",
        header: "Vlr. Ref.",
        align: "right",
        nowrap: true,
        filter: "range",
        total: false, numero: (r) => r.valorReferencia,
        render: (r) => <span className="tabular-nums text-text-2">{r.valorReferencia != null ? brl(r.valorReferencia) : "—"}</span>,
      },
      {
        key: "vlrTotal",
        header: "Vlr. Total",
        align: "right",
        nowrap: true,
        filter: "range",
        numero: (r) => r.valorTotal,
        render: (r) => <span className="font-semibold tabular-nums text-text">{r.valorTotal != null ? brl(r.valorTotal) : "—"}</span>,
      },
      {
        key: "data",
        header: "Data",
        nowrap: true,
        filter: "date",
        value: (r) => r.dataDesejada ?? "",
        render: (r) => <span className="tabular-nums text-muted">{dataBR(r.dataDesejada)}</span>,
      },
    );
    return cols;
  }, [showUnidade, temOrigem, temDominio]);

  return (
    <div className="space-y-[var(--gap-block)]">
      {busca == null && (!semBusca || fim) && (
        <div className="flex items-center gap-2">
          {!semBusca && <BuscaItens valor={q} onMudar={setQ} />}
          {fim && <div className="ml-auto flex shrink-0 items-center gap-2">{fim}</div>}
        </div>
      )}
      <DataTable
        columns={colunas}
        rows={filtradas}
        getKey={(r) => r.id}
        {...(alturaCheia ? { scrollInterno: true } : { pageSize: 20 })}
        linhasSalvas="consulta-itens"
        exportar={{ nome: "Itens do PCA" }}
        density="compact"
        minWidth={temOrigem ? 1180 : showUnidade ? 980 : 900}
        onRowClick={onRowClick}
        activeKey={ativo}
        ordemInicial={{ key: "seq", dir: "desc" }}
        resumo={(l) => `${l.length} ${l.length === 1 ? "item" : "itens"} · ${brl(l.reduce((s, r) => s + (r.valorTotal ?? 0), 0))}`}
      />
    </div>
  );
}

/** A busca da consulta (itens: produto, código, protocolo ou DFD; vários com ":") — compacta, na altura das barras. */
export function BuscaItens({
  valor,
  onMudar,
  placeholder = "Buscar produto, código, protocolo ou DFD",
}: {
  valor: string;
  onMudar: (v: string) => void;
  /** O que a busca procura (padrão: a dos itens). */
  placeholder?: string;
}) {
  return (
    <div className="min-w-[min(100%,12rem)] flex-1 sm:max-w-xs">
      <SearchField compacto value={valor} onChange={(e) => onMudar(e.target.value)} onClear={() => onMudar("")} placeholder={placeholder} aria-label={`${placeholder} (vários com :)`} />
    </div>
  );
}
