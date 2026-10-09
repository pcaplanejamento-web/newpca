/**
 * EXPORTAR uma tabela (a `DataTable` com `exportar`) em .xlsx: as linhas que estão À VISTA — com os filtros das colunas e
 * na ordem da tabela, todas as páginas — e as colunas VISÍVEIS, na ordem da edição em uso. Núcleo PURO (testado); o
 * SheetJS só é carregado no clique (`baixarPlanilhaXlsx`).
 *
 * O valor de cada célula sai do que a coluna já oferece ao filtro: o NÚMERO (valores, contagens — ficam numéricos na
 * planilha), senão os VÁRIOS valores (ex.: o Estado com todos os problemas) unidos por "; ", senão o texto; as colunas de
 * DATA (ISO) saem em dd/mm/aaaa (com a hora, quando há). Coluna sem cabeçalho ou sem valor (ações) fica de fora.
 */

export type ColunaPlanilha<R> = {
  cabecalho: string;
  /** O NÚMERO como TEXTO no PDF (padrão: pt-BR com até 2 casas). */
  formatar?: (n: number) => string;
  /** A COR do texto da célula no PDF (CSS — a mesma da tela, ex.: "var(--danger)"); sem ela, número negativo = vermelho. */
  cor?: (r: R) => string | null | undefined;
  /** Coluna de data (o valor é ISO — sai em dd/mm/aaaa). */
  data?: boolean;
  valor?: (r: R) => string;
  valores?: (r: R) => string[];
  numero?: (r: R) => number | null | undefined;
  /** `false` = a coluna numérica NÃO entra na linha TOTAL (valor unitário, média, %, identificador). */
  total?: false;
};

/** "2026-09-30" → "30/09/2026"; "2026-09-30T14:05…"/"2026-09-30 14:05" → "30/09/2026 14:05"; outro texto fica como está. */
export function dataDaPlanilha(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ""}`;
}

/** O valor de uma célula na planilha (número, texto ou vazio). */
function celula<R>(c: ColunaPlanilha<R>, r: R): string | number {
  if (c.numero) {
    const n = c.numero(r);
    if (typeof n === "number" && Number.isFinite(n)) return n;
    if (!c.valor && !c.valores) return "";
  }
  if (c.valores) {
    const v = c.valores(r).filter((x) => x !== "");
    if (v.length) return v.join("; ");
  }
  const t = c.valor ? c.valor(r) : "";
  if (!t || t === "—") return "";
  return c.data ? dataDaPlanilha(t) : t;
}

/** As colunas que entram na planilha (com cabeçalho e algum valor). */
export const colunasExportaveis = <R>(colunas: readonly ColunaPlanilha<R>[]) =>
  colunas.filter((c) => c.cabecalho.trim() !== "" && (c.valor || c.valores || c.numero));

const somavel = <R>(c: ColunaPlanilha<R>) => !!c.numero && c.total !== false;

/**
 * A LINHA TOTAL (no fim da planilha e do PDF): a soma de cada coluna numérica somável (valores e quantidades — vazios e
 * não números fora; arredondada ao centavo), "TOTAL" na 1ª coluna NÃO somada e as demais vazias. `null` sem linhas ou
 * sem coluna somável.
 */
export function linhaTotal<R>(cols: readonly ColunaPlanilha<R>[], linhas: readonly R[]): (string | number)[] | null {
  if (!linhas.length || !cols.some(somavel)) return null;
  const rotulo = cols.findIndex((c) => !somavel(c));
  return cols.map((c, j) => {
    if (!somavel(c)) return j === rotulo ? "TOTAL" : "";
    let soma = 0;
    for (const r of linhas) {
      const n = c.numero?.(r);
      if (typeof n === "number" && Number.isFinite(n)) soma += n;
    }
    return Math.round(soma * 100) / 100 || 0;
  });
}

/** As LINHAS da planilha: o cabeçalho + uma por registro, na ordem recebida, + a linha TOTAL. */
export function linhasPlanilhaTabela<R>(colunas: readonly ColunaPlanilha<R>[], linhas: readonly R[]): (string | number)[][] {
  const cols = colunasExportaveis(colunas);
  const total = linhaTotal(cols, linhas);
  return [cols.map((c) => c.cabecalho), ...linhas.map((r) => cols.map((c) => celula(c, r))), ...(total ? [total] : [])];
}

const numeroBR = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/**
 * A MESMA tabela para o PDF: tudo como TEXTO (o número formatado — R$, %, quantidade — como a tela mostra), o
 * alinhamento de cada coluna (números à direita) e a COR de cada célula (a da coluna; senão, número negativo em
 * vermelho). Linhas e colunas = as da planilha, com a linha TOTAL no fim em DESTAQUE (`destaques`).
 */
export function tabelaParaPdf<R>(
  colunas: readonly ColunaPlanilha<R>[],
  linhas: readonly R[],
): { cabecalho: string[]; linhas: string[][]; alinhar: ("left" | "right")[]; cores: (string | null)[][]; destaques: number[] } {
  const cols = colunasExportaveis(colunas);
  const formatado = (c: ColunaPlanilha<R>, v: string | number): string => (typeof v === "number" ? (c.formatar ?? numeroBR)(v) : v);
  const total = linhaTotal(cols, linhas);
  return {
    cabecalho: cols.map((c) => c.cabecalho),
    linhas: [
      ...linhas.map((r) => cols.map((c) => formatado(c, celula(c, r)))),
      ...(total ? [cols.map((c, j) => formatado(c, total[j]))] : []),
    ],
    alinhar: cols.map((c) => (c.numero ? "right" : "left")),
    cores: [
      ...linhas.map((r) =>
        cols.map((c) => {
          const propria = c.cor?.(r);
          if (propria) return propria;
          const n = c.numero?.(r);
          return typeof n === "number" && n < 0 ? "var(--danger)" : null;
        }),
      ),
      ...(total ? [total.map((v) => (typeof v === "number" && v < 0 ? "var(--danger)" : null))] : []),
    ],
    destaques: total ? [linhas.length] : [],
  };
}

/** O nome do arquivo: "<nome> - AAAA-MM-DD.xlsx", sem caracteres que o sistema de arquivos recusa. */
export function nomeArquivoPlanilha(nome: string, hojeIso: string): string {
  const base = nome.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "tabela";
  return `${base} - ${hojeIso}.xlsx`;
}

/** Baixa as linhas em .xlsx (o SheetJS é carregado só aqui). O nome da aba tem até 31 caracteres (limite do Excel). */
export async function baixarPlanilhaXlsx(arquivo: string, aba: string, linhas: (string | number)[][]): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, aba.replace(/[\\/?*[\]:]+/g, " ").slice(0, 31) || "Tabela");
  XLSX.writeFile(wb, arquivo);
}
