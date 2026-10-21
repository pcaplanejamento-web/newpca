"use client";

import { useMemo } from "react";
import { brl, dataBR, mesLabel, num } from "@/lib/format";
import { type LeituraPlanilhas, type LinhaPrevia, linhasDaPrevia } from "@/lib/parse-xlsx-core";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { Modal } from "./Modal";
import { StatMini } from "./StatMini";

/** A `DataTable` desenha a célula pelo `render`; o `value` é filtro/ordem — aqui os dois são o mesmo texto. */
const COLUNAS: Column<LinhaPrevia>[] = ([
  { key: "unidade", header: "Unidade", value: (r) => r.unidade, nowrap: true },
  { key: "seq", header: "Seq.", value: (r) => String(r.sequencial ?? ""), numero: (r) => r.sequencial, nowrap: true, total: false, formatarFaixa: num },
  { key: "codigo", header: "Código", value: (r) => r.idProduto ?? "—", nowrap: true },
  { key: "produto", header: "Produto", value: (r) => r.nomeProduto ?? "—", align: "left", minWidth: 280 },
  { key: "um", header: "Unidade de medida", value: (r) => r.unidadeMedida ?? "—", nowrap: true },
  { key: "classificacao", header: "Classificação", value: (r) => r.classificacao ?? "—", nowrap: true },
  { key: "dominio", header: "Domínio", value: (r) => r.dominio ?? "—", nowrap: true },
  { key: "qtd", header: "Qtd.", value: (r) => num(r.quantidade), numero: (r) => r.quantidade, filter: "range", formatarFaixa: num, nowrap: true },
  { key: "vu", header: "Valor unitário", value: (r) => brl(r.valorReferencia), numero: (r) => r.valorReferencia, filter: "range", align: "right", nowrap: true, total: false },
  { key: "vt", header: "Valor total", value: (r) => brl(r.valorTotal), numero: (r) => r.valorTotal, filter: "range", align: "right", nowrap: true },
  {
    key: "previsao",
    header: "Data/Previsão",
    value: (r) => r.previsaoGenerica ?? (r.mesDesejado ? mesLabel(r.mesDesejado, r.anoDesejado) : r.dataDesejada ? dataBR(r.dataDesejada) : "—"),
    nowrap: true,
  },
  { key: "prioridade", header: "Prioridade", value: (r) => r.prioridade ?? "—", nowrap: true },
  { key: "protocolo", header: "ID protocolo", value: (r) => r.protocoloIdExterno ?? "—", nowrap: true },
] as Column<LinhaPrevia>[]).map((c) => ({ ...c, render: c.value }));

/**
 * PRÉVIA COMPLETA da planilha do PCA antes de importar: o resumo, o que foi apontado na leitura e TODAS as linhas
 * como serão gravadas (a mesma normalização do servidor). Só "Importar" grava; fechar/Cancelar não muda nada.
 */
export function PreviaPlanilha({
  nomeArquivo,
  leitura,
  onCancelar,
  onImportar,
}: {
  nomeArquivo: string;
  leitura: LeituraPlanilhas;
  onCancelar: () => void;
  onImportar: () => void;
}) {
  const linhas = useMemo(() => linhasDaPrevia(leitura), [leitura]);
  const total = useMemo(() => linhas.reduce((s, r) => s + (r.valorTotal ?? 0), 0), [linhas]);
  const apontados = leitura.problemas.reduce((s, p) => s + p.quantidade, 0);
  const n = leitura.planilhas.length;
  return (
    <Modal
      open
      onClose={onCancelar}
      size="full"
      titulo={`Prévia — ${nomeArquivo}`}
      rodape={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-sm text-muted">Reenviar uma unidade substitui a planilha dela.</span>
          <Button variant="secondary" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button onClick={onImportar} disabled={linhas.length === 0}>
            Importar {num(n)} planilha(s)
          </Button>
        </div>
      }
    >
      <div className="space-y-[var(--gap-block)]">
        <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-4">
          <StatMini label={leitura.formato === "consolidado" ? "Unidades (LOCAL)" : "Planilha"} value={num(n)} />
          <StatMini label="Itens" value={num(linhas.length)} />
          <StatMini label="Valor total" value={brl(total)} tone="accent" />
          <StatMini label="Apontamentos" value={num(apontados)} tone={apontados ? "warn" : "ok"} />
        </div>
        {leitura.problemas.length > 0 && (
          <Callout kind="warn">
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {leitura.problemas.map((p) => (
                <li key={p.tipo} title={p.exemplos.join("\n")}>
                  <span className="font-semibold">{num(p.quantidade)}</span> {p.tipo}
                  {p.exemplos.length > 0 && <span className="text-muted"> — ex.: {p.exemplos.slice(0, 3).join("; ")}</span>}
                </li>
              ))}
            </ul>
          </Callout>
        )}
        <DataTable
          columns={COLUNAS}
          rows={linhas}
          getKey={(r) => String(r.indice)}
          density="compact"
          exportar={{ nome: `Prévia ${nomeArquivo}` }}
          resumo={(rs) => `${num(rs.length)} itens · ${brl(rs.reduce((s, r) => s + (r.valorTotal ?? 0), 0))}`}
        />
      </div>
    </Modal>
  );
}
