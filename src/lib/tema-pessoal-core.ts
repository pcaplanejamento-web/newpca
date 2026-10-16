// Tema da PESSOA (neste navegador): o modo claro/escuro e a tonalidade do escuro. Núcleo PURO (testado) + o trecho que roda
// ANTES da 1ª pintura (sem piscar) — os dois com a MESMA regra.

export const MODOS_TEMA = ["site", "claro", "escuro", "sistema", "horario", "personalizado"] as const;
export type ModoTema = (typeof MODOS_TEMA)[number];
export const TONS_ESCURO = ["carvao", "azul", "preto"] as const;
export type TomEscuro = (typeof TONS_ESCURO)[number];

export type PrefsTema = { modo: ModoTema; tom: TomEscuro; inicio: string; fim: string };

export const CHAVE_TEMA = "aparencia:pessoa";
export const EVENTO_TEMA = "tema-pessoal";
/** O modo do SITE (o padrão de fábrica). */
export const TEMA_DO_SITE = "light" as const;
/** "Pelo horário do dia": escuro das 18h às 06h. */
export const HORARIO_DIA = { inicio: "18:00", fim: "06:00" } as const;
export const PREFS_PADRAO: PrefsTema = { modo: "site", tom: "carvao", inicio: "19:00", fim: "07:00" };

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function horaValida(h: unknown): h is string {
  return typeof h === "string" && HORA.test(h);
}

/** Qualquer JSON → preferências válidas (o que não vale, o padrão). */
export function lerPrefsTema(v: unknown): PrefsTema {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return {
    modo: (MODOS_TEMA as readonly string[]).includes(o.modo as string) ? (o.modo as ModoTema) : PREFS_PADRAO.modo,
    tom: (TONS_ESCURO as readonly string[]).includes(o.tom as string) ? (o.tom as TomEscuro) : PREFS_PADRAO.tom,
    inicio: horaValida(o.inicio) ? o.inicio : PREFS_PADRAO.inicio,
    fim: horaValida(o.fim) ? o.fim : PREFS_PADRAO.fim,
  };
}

const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

/** O minuto `agora` (0–1439) está no intervalo escuro? Atravessa a meia-noite quando o início é depois do fim; início =
 * fim = nunca escuro. */
export function noIntervaloEscuro(agora: number, inicio: string, fim: string): boolean {
  const a = minutos(inicio);
  const b = minutos(fim);
  if (a === b) return false;
  return a < b ? agora >= a && agora < b : agora >= a || agora < b;
}

/** O valor do tema para o next-themes: "light" | "dark" | "system". */
export function temaDoModo(p: PrefsTema, agora: number): "light" | "dark" | "system" {
  switch (p.modo) {
    case "claro":
      return "light";
    case "escuro":
      return "dark";
    case "sistema":
      return "system";
    case "horario":
      return noIntervaloEscuro(agora, HORARIO_DIA.inicio, HORARIO_DIA.fim) ? "dark" : "light";
    case "personalizado":
      return noIntervaloEscuro(agora, p.inicio, p.fim) ? "dark" : "light";
    default:
      return TEMA_DO_SITE;
  }
}

/** Minutos até a próxima troca automática (só nos modos por horário; senão null) — o relógio da tela acorda nela. */
export function minutosAteTroca(p: PrefsTema, agora: number): number | null {
  const par = p.modo === "horario" ? HORARIO_DIA : p.modo === "personalizado" ? p : null;
  if (!par) return null;
  const alvos = [minutos(par.inicio), minutos(par.fim)].map((m) => (m - agora + 1440) % 1440 || 1440);
  return Math.min(...alvos);
}

export const horaTexto = (h: string) => `${h.slice(0, 2)}h${h.slice(3) === "00" ? "" : h.slice(3)}`;

/** O trecho que roda no <head>/<body> ANTES do next-themes: lê as preferências, grava o tema que vale AGORA na chave do
 * next-themes ("theme") e põe a tonalidade no <html>. A MESMA regra de `temaDoModo` (o teste roda os dois). */
export const SCRIPT_TEMA = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(CHAVE_TEMA)})||"null");if(!p||typeof p!=="object")return;var h=/^([01]\\d|2[0-3]):([0-5]\\d)$/,m=function(x){return +x.slice(0,2)*60+ +x.slice(3,5)},d=new Date(),n=d.getHours()*60+d.getMinutes(),e=function(i,f){var a=m(i),b=m(f);return a===b?false:a<b?n>=a&&n<b:n>=a||n<b},t=${JSON.stringify(TEMA_DO_SITE)};if(p.modo==="claro")t="light";else if(p.modo==="escuro")t="dark";else if(p.modo==="sistema")t="system";else if(p.modo==="horario")t=e(${JSON.stringify(HORARIO_DIA.inicio)},${JSON.stringify(HORARIO_DIA.fim)})?"dark":"light";else if(p.modo==="personalizado"&&h.test(p.inicio)&&h.test(p.fim))t=e(p.inicio,p.fim)?"dark":"light";localStorage.setItem("theme",t);if(p.tom==="azul"||p.tom==="preto")document.documentElement.setAttribute("data-escuro",p.tom)}catch(_){}})();`;
