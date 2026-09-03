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

export function pct(part: number, whole: number): string {
  if (!whole) return "0%";
  return `${((part / whole) * 100).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })}%`;
}
