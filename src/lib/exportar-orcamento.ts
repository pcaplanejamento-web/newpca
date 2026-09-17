import * as XLSX from "xlsx";
import { brl } from "./format";

/**
 * Exportação de um ORÇAMENTO — roda NO NAVEGADOR. `.xlsx` via SheetJS (mesmo pacote do
 * import, fora do bundle do Worker); `.pdf` via uma janela de impressão formatada (o
 * navegador salva como PDF) — sem dependência nova. Espelha `exportar-catalogo.ts`.
 */
export type OrcamentoItemExport = {
  orgao: string | null;
  unidade: string | null;
  nomeElemento: string | null;
  codigoElemento: string | null;
  valorEmendaImpositiva: number;
  valorInicial: number;
  valorSuplementacao: number;
  valorEmpenho: number;
  saldo: number;
  valorAnulacao: number;
};

const nomeSeguro = (s: string) => s.replace(/[^\p{L}\p{N}\-_ ]+/gu, "").trim().slice(0, 80) || "orcamento";

const CABECALHO = [
  "Órgão",
  "Unidade",
  "Nome Elemento",
  "Código Elemento",
  "Valor Emenda Impositiva",
  "Valor Inicial",
  "Valor Suplementação",
  "Valor Empenho",
  "Saldo",
  "Valor Anulação",
];

/** Baixa o orçamento como planilha .xlsx (valores como número). */
export function exportarOrcamentoXlsx(nome: string, itens: OrcamentoItemExport[]) {
  const aoa: (string | number)[][] = [
    CABECALHO,
    ...itens.map((it) => [
      it.orgao ?? "",
      it.unidade ?? "",
      it.nomeElemento ?? "",
      it.codigoElemento ?? "",
      it.valorEmendaImpositiva,
      it.valorInicial,
      it.valorSuplementacao,
      it.valorEmpenho,
      it.saldo,
      it.valorAnulacao,
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 34 }, { wch: 30 }, { wch: 42 }, { wch: 16 }, ...Array(6).fill({ wch: 16 })];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Orçamento");
  XLSX.writeFile(wb, `${nomeSeguro(nome)}.xlsx`);
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

/** Abre uma janela de impressão formatada do orçamento (o usuário salva como PDF). */
export function exportarOrcamentoPdf(nome: string, itens: OrcamentoItemExport[]) {
  const w = window.open("", "_blank");
  if (!w) throw new Error("Permita pop-ups para exportar em PDF.");
  const linhas = itens
    .map(
      (it) =>
        `<tr><td>${esc(it.orgao ?? "")}</td><td>${esc(it.unidade ?? "")}</td><td>${esc(it.nomeElemento ?? "")}</td><td class="m">${esc(it.codigoElemento ?? "")}</td><td class="v">${esc(brl(it.valorInicial))}</td><td class="v">${esc(brl(it.valorSuplementacao))}</td><td class="v">${esc(brl(it.valorEmpenho))}</td><td class="v">${esc(brl(it.saldo))}</td></tr>`,
    )
    .join("");
  const totalInicial = itens.reduce((s, it) => s + it.valorInicial, 0);
  const sub = `${itens.length} ${itens.length === 1 ? "lançamento" : "lançamentos"} · Dotação inicial ${brl(totalInicial)}`;
  // Documento de impressão (papel = sempre claro) — cores fixas por ser artefato de saída.
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(nome)}</title><style>
*{box-sizing:border-box}body{font:11px/1.4 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;margin:20px}
h1{font-size:17px;margin:0 0 4px}.sub{color:#6b7280;font-size:11px;margin:0 0 14px}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #d1d5db;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#f3f4f6;font-size:9.5px;text-transform:uppercase;letter-spacing:.03em}
td.v{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}td.m{font-family:ui-monospace,Menlo,Consolas,monospace;white-space:nowrap}
tr{break-inside:avoid}thead{display:table-header-group}@page{margin:12mm;size:landscape}
</style></head><body><h1>${esc(nome)}</h1><p class="sub">${esc(sub)} · Plataforma PCA</p>
<table><thead><tr><th>Órgão</th><th>Unidade</th><th>Elemento</th><th>Código</th><th>Inicial</th><th>Suplement.</th><th>Empenho</th><th>Saldo</th></tr></thead><tbody>${linhas}</tbody></table>
<script>window.onload=function(){setTimeout(function(){window.print()},80)}</script></body></html>`;
  w.document.write(html);
  w.document.close();
}
