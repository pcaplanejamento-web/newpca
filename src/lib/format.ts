// Formatação pt-BR compartilhada (servidor e cliente).

const _brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const _num = new Intl.NumberFormat("pt-BR");
const _dec = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const brl = (n?: number | null) => _brl.format(Number(n ?? 0));
export const num = (n?: number | null) => _num.format(Number(n ?? 0));
export const dec = (n?: number | null) => _dec.format(Number(n ?? 0));

/** Valor curto para eixos/legendas: R$ 1,2 mi. */
export function brlCompact(n?: number | null): string {
  const v = Number(n ?? 0);
  const abs = Math.abs(v);
  const f = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (abs >= 1e9) return `R$ ${f(v / 1e9)} bi`;
  if (abs >= 1e6) return `R$ ${f(v / 1e6)} mi`;
  if (abs >= 1e3) return `R$ ${f(v / 1e3)} mil`;
  return _brl.format(v);
}

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export function mesLabel(mes?: number | null, ano?: number | null): string {
  if (!mes || mes < 1 || mes > 12) return "s/ data";
  const yy = ano != null ? `/${String(ano).slice(-2)}` : "";
  return `${MESES[mes - 1]}${yy}`;
}

export function dataBR(iso?: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// Timestamps do SQLite (`CURRENT_TIMESTAMP` = UTC "AAAA-MM-DD HH:MM:SS") no fuso de BRASÍLIA — o MESMO
// texto no servidor e no navegador (sem divergência de hidratação).
const _brasilia = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const instanteUtc = (ts: string) => new Date(`${ts.trim().replace(" ", "T")}${/Z|[+-]\d\d:?\d\d$/.test(ts) ? "" : "Z"}`);
const partes = (d: Date) => Object.fromEntries(_brasilia.formatToParts(d).map((p) => [p.type, p.value]));

/** Timestamp UTC do banco → "dd/mm/aaaa hh:mm" (Brasília). */
export function dataHoraBR(ts?: string | null): string {
  if (!ts) return "—";
  const d = instanteUtc(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const p = partes(d);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** Timestamp UTC do banco → data ISO "AAAA-MM-DD" em Brasília (filtro de data das tabelas). */
export function dataIsoBrasilia(ts?: string | null): string {
  if (!ts) return "";
  const d = instanteUtc(ts);
  if (Number.isNaN(d.getTime())) return "";
  const p = partes(d);
  return `${p.year}-${p.month}-${p.day}`;
}

export function pct(part: number, whole: number): string {
  if (!whole) return "0%";
  return `${((part / whole) * 100).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })}%`;
}

/**
 * Dica (`title`) de uma LISTA — um por linha, só os `max` primeiros (o resto vira "… e mais N"): uma dica de milhares de
 * linhas não serve para ler e pesa na página. Só os exibidos são formatados.
 */
export function dicaLista<T>(itens: readonly T[], texto: (it: T) => string, max = 30): string {
  const linhas = itens.slice(0, max).map(texto).join("\n");
  return itens.length > max ? `${linhas}\n… e mais ${num(itens.length - max)}` : linhas;
}

/** Tamanho em bytes → texto curto pt-BR (base 1024): 1,5 MB, 820 KB, 512 B. */
export function formatBytes(n?: number | null): string {
  const v = Number(n ?? 0);
  const abs = Math.abs(v);
  const f = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (abs >= 1024 ** 3) return `${f(v / 1024 ** 3)} GB`;
  if (abs >= 1024 ** 2) return `${f(v / 1024 ** 2)} MB`;
  if (abs >= 1024) return `${f(v / 1024)} KB`;
  return `${Math.round(v)} B`;
}
