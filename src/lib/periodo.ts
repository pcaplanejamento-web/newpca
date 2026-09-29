import { dataBR } from "./format.ts";
import type { IntervaloData } from "./tabela-filtros.ts";

/**
 * PERÍODO — o valor do seletor de período do sistema (`PeriodoCorpo`/`PeriodoPicker`: os atalhos, o ano, o mês e o
 * intervalo DE/ATÉ) e a conversão PURA dele num intervalo de dias (AAAA-MM-DD) — a MESMA régua no filtro de datas das
 * tabelas e no Dashboard da Mesa. "Hoje" é injetado (as tabelas usam o dia do aparelho; o Dashboard, o dia de Brasília);
 * a semana vai de domingo a sábado.
 */
export type Periodo = {
  preset?: "todo" | "hoje" | "semana" | "mes" | "custom";
  ano?: number;
  mes?: number;
  de?: string;
  ate?: string;
};

/** Sem limites (todo o período). */
export const PERIODO_TODO: Periodo = { preset: "todo" };

/** Os atalhos do seletor (fecham o painel ao escolher). */
export const ATALHOS_PERIODO: readonly { k: NonNullable<Periodo["preset"]>; l: string }[] = [
  { k: "todo", l: "Todo o período" },
  { k: "hoje", l: "Hoje" },
  { k: "semana", l: "Esta semana" },
  { k: "mes", l: "Este mês" },
];
export const MESES_PERIODO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const pad = (n: number) => String(n).padStart(2, "0");
const isoUtc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d)).toISOString().slice(0, 10);
/** Hoje no relógio do aparelho (AAAA-MM-DD). */
const hojeLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** Uma data AAAA-MM-DD que existe no calendário (nada de 30/02 nem texto solto). */
function dataValida(s: string | undefined): s is string {
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) : null;
  return !!m && isoUtc(Number(m[1]), Number(m[2]), Number(m[3])) === s;
}
const anoValido = (a: number | undefined): a is number => Number.isInteger(a) && (a as number) >= 1000 && (a as number) <= 9999;
const mesValido = (m: number | undefined): m is number => Number.isInteger(m) && (m as number) >= 1 && (m as number) <= 12;

/** DE e ATÉ válidos, na ordem (trocados quando vêm invertidos); só as pontas que existem. */
function limites(v: Periodo): IntervaloData | null {
  const de = dataValida(v.de) ? v.de : undefined;
  const ate = dataValida(v.ate) ? v.ate : undefined;
  if (de && ate) return de > ate ? { de: ate, ate: de } : { de, ate };
  return de ? { de } : ate ? { ate } : null;
}

/** O período como intervalo de dias ({} = sem limites). */
export function intervaloDoPeriodo(v: Periodo, hoje: string = hojeLocal()): IntervaloData {
  const i = limites(v);
  if (i) return i;
  if (dataValida(hoje)) {
    const [a, m, d] = hoje.split("-").map(Number);
    if (v.preset === "hoje") return { de: hoje, ate: hoje };
    if (v.preset === "semana") {
      const domingo = d - new Date(Date.UTC(a, m - 1, d)).getUTCDay();
      return { de: isoUtc(a, m, domingo), ate: isoUtc(a, m, domingo + 6) };
    }
    if (v.preset === "mes") return { de: isoUtc(a, m, 1), ate: isoUtc(a, m + 1, 0) };
  }
  if (anoValido(v.ano) && mesValido(v.mes)) return { de: isoUtc(v.ano, v.mes, 1), ate: isoUtc(v.ano, v.mes + 1, 0) };
  if (anoValido(v.ano)) return { de: `${v.ano}-01-01`, ate: `${v.ano}-12-31` };
  return {};
}

/** O dia (AAAA-MM-DD) está no intervalo? Sem limites = sempre (inclusive sem data); com limites, só com data. */
export const noIntervalo = (dia: string | null | undefined, i: IntervaloData): boolean =>
  (!i.de && !i.ate) || (!!dia && (!i.de || dia >= i.de) && (!i.ate || dia <= i.ate));

/** O intervalo por extenso: "27/09 a 03/10/2026", "29/12/2025 a 04/01/2026", "29/09/2026", "desde …", "até …" ("" =
 * sem limites). */
export function textoIntervalo({ de, ate }: IntervaloData): string {
  if (de && ate) {
    if (de === ate) return dataBR(de);
    return de.slice(0, 4) === ate.slice(0, 4) ? `${dataBR(de).slice(0, 5)} a ${dataBR(ate)}` : `${dataBR(de)} a ${dataBR(ate)}`;
  }
  if (de) return `desde ${dataBR(de)}`;
  if (ate) return `até ${dataBR(ate)}`;
  return "";
}

/** O rótulo curto do seletor: o atalho ("Esta semana"), o mês ("Set 2026"), o ano ou o intervalo em dd/mm/aaaa. */
export function rotuloPeriodo(v: Periodo): string {
  const i = limites(v);
  if (i) return i.de && i.ate ? (i.de === i.ate ? dataBR(i.de) : `${dataBR(i.de)} – ${dataBR(i.ate)}`) : i.de ? `Desde ${dataBR(i.de)}` : `Até ${dataBR(i.ate)}`;
  if (anoValido(v.ano) && mesValido(v.mes)) return `${MESES_PERIODO[v.mes - 1]} ${v.ano}`;
  if (anoValido(v.ano)) return String(v.ano);
  return ATALHOS_PERIODO.find((p) => p.k === v.preset)?.l ?? "Todo o período";
}
