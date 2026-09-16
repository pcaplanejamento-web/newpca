import * as XLSX from "xlsx";

/**
 * Exportação de um catálogo — roda NO NAVEGADOR. `.xlsx` via SheetJS (mesmo pacote do
 * import, fora do bundle do Worker); `.pdf` via uma janela de impressão formatada
 * (o navegador salva como PDF) — sem dependência nova. Recebe só os campos exibidos.
 */
export type CatalogoItemExport = {
  sequencial: number | null;
  codigo: string;
  codigoRaw: string | null;
  descricao: string;
  unidade: string | null;
  tipos: string[];
};

const nomeSeguro = (s: string) => s.replace(/[^\p{L}\p{N}\-_ ]+/gu, "").trim().slice(0, 80) || "catalogo";

/** Baixa o catálogo como planilha .xlsx (códigos como texto p/ preservar a precisão). */
export function exportarCatalogoXlsx(nome: string, itens: CatalogoItemExport[]) {
  const aoa: (string | number)[][] = [
    ["Item", "Código", "Descrição", "Unidade de Medida", "Tipos de DFD"],
    ...itens.map((it) => [
      it.sequencial ?? "",
      it.codigoRaw ?? it.codigo, // string → SheetJS mantém como texto (sem notação científica)
      it.descricao,
      it.unidade ?? "",
      it.tipos.join(", "),
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 6 }, { wch: 16 }, { wch: 70 }, { wch: 18 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Catálogo");
  XLSX.writeFile(wb, `${nomeSeguro(nome)}.xlsx`);
}

/** Baixa um MODELO .xlsx (cabeçalho + 1 linha de exemplo) para o usuário preencher e importar. */
export function exportarModeloCatalogoXlsx() {
  const aoa: (string | number)[][] = [
    ["Item", "Código", "Descrição", "Unidade de Medida"],
    ["1", "000000001", "EXEMPLO — apague esta linha e preencha com os seus itens", "UNIDADE"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 6 }, { wch: 16 }, { wch: 72 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Catálogo");
  XLSX.writeFile(wb, "modelo-catalogo.xlsx");
}

const esc = (s: string) =>
  s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

/** Abre uma janela de impressão formatada do catálogo (o usuário salva como PDF). */
export function exportarCatalogoPdf(nome: string, itens: CatalogoItemExport[]) {
  const w = window.open("", "_blank");
  if (!w) throw new Error("Permita pop-ups para exportar em PDF.");
  const linhas = itens
    .map(
      (it) =>
        `<tr><td class="c">${it.sequencial ?? ""}</td><td class="m">${esc(it.codigoRaw ?? it.codigo)}</td><td>${esc(it.descricao)}</td><td class="c">${esc(it.unidade ?? "")}</td><td class="c">${esc(it.tipos.join(", "))}</td></tr>`,
    )
    .join("");
  const total = `${itens.length} ${itens.length === 1 ? "item" : "itens"}`;
  // Documento de impressão (papel = sempre claro) — cores fixas por ser artefato de saída.
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(nome)}</title><style>
*{box-sizing:border-box}body{font:12px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;margin:24px}
h1{font-size:18px;margin:0 0 4px}.sub{color:#6b7280;font-size:11px;margin:0 0 16px}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #d1d5db;padding:5px 7px;text-align:left;vertical-align:top}
th{background:#f3f4f6;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em}
td.c{text-align:center;white-space:nowrap}td.m{font-family:ui-monospace,Menlo,Consolas,monospace}
tr{break-inside:avoid}thead{display:table-header-group}@page{margin:14mm}
</style></head><body><h1>${esc(nome)}</h1><p class="sub">${total} · Plataforma PCA</p>
<table><thead><tr><th>Item</th><th>Código</th><th>Descrição</th><th>Unid.</th><th>Tipos</th></tr></thead><tbody>${linhas}</tbody></table>
<script>window.onload=function(){setTimeout(function(){window.print()},80)}</script></body></html>`;
  w.document.write(html);
  w.document.close();
}
