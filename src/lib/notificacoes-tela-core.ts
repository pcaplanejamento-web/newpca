/**
 * Núcleo PURO da TELA do sino (sem DOM → testável): o dia de cada aviso (Hoje · Ontem · Esta semana · Antes), a hora
 * RELATIVA ("há 5 min") e o agrupamento dos REPETIDOS (vários avisos do mesmo tipo sobre a mesma tarefa, em sequência).
 * As datas do banco vêm em UTC ("AAAA-MM-DD HH:MM:SS" — o CURRENT_TIMESTAMP do SQLite); o dia é o de Brasília.
 */

export type AvisoTela = { id: number; tipo: string; tarefaId: number | null; lida: boolean; criadoEm: string | null };

/** O instante (ms) de uma data do banco (UTC, com ou sem "T"/"Z"); inválida = `null`. */
export function instante(criadoEm: string | null | undefined): number | null {
  if (!criadoEm) return null;
  const s = criadoEm.includes("T") ? criadoEm : criadoEm.replace(" ", "T");
  const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(ms) ? null : ms;
}

const BRASILIA_MS = 3 * 3_600_000;
/** O dia de Brasília (número de dias desde 1970) de um instante. */
const diaBrasilia = (ms: number) => Math.floor((ms - BRASILIA_MS) / 86_400_000);

export const GRUPOS_DIA = ["Hoje", "Ontem", "Esta semana", "Antes"] as const;
export type GrupoDia = (typeof GRUPOS_DIA)[number];

/** Em que grupo do dia o aviso cai (a semana = os últimos 7 dias). */
export function grupoDoDia(criadoEm: string | null, agora: number): GrupoDia {
  const ms = instante(criadoEm);
  if (ms == null) return "Antes";
  const d = diaBrasilia(agora) - diaBrasilia(ms);
  return d <= 0 ? "Hoje" : d === 1 ? "Ontem" : d < 7 ? "Esta semana" : "Antes";
}

/** A hora RELATIVA: "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias" e, depois de uma semana, a data (dd/mm). */
export function tempoRelativo(criadoEm: string | null, agora: number): string {
  const ms = instante(criadoEm);
  if (ms == null) return "";
  const s = Math.max(0, Math.round((agora - ms) / 1000));
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  const dias = diaBrasilia(agora) - diaBrasilia(ms);
  if (dias === 0) return `há ${Math.floor(s / 3600)} h`;
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  const d = new Date(ms - BRASILIA_MS);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** A data e hora COMPLETA de Brasília (a dica da hora relativa). */
export function dataHoraCompleta(criadoEm: string | null): string {
  const ms = instante(criadoEm);
  if (ms == null) return "";
  const d = new Date(ms - BRASILIA_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} às ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Um grupo da tela: o aviso PRINCIPAL (o mais recente) e os repetidos que ele resume. */
export type LinhaAviso<T extends AvisoTela> = { principal: T; outros: T[] };
export type SecaoAvisos<T extends AvisoTela> = { grupo: GrupoDia; linhas: LinhaAviso<T>[] };

/**
 * Separa a lista (a mais recente primeiro) pelos dias e, dentro de cada dia, JUNTA os repetidos em sequência: o mesmo
 * tipo sobre a mesma tarefa, com a mesma situação (lida/não lida) — "3 comentários em #12". Aviso sem tarefa nunca junta.
 */
export function secoesDeAvisos<T extends AvisoTela>(itens: readonly T[], agora: number): SecaoAvisos<T>[] {
  const secoes: SecaoAvisos<T>[] = [];
  for (const n of itens) {
    const grupo = grupoDoDia(n.criadoEm, agora);
    let sec = secoes[secoes.length - 1];
    if (!sec || sec.grupo !== grupo) {
      sec = { grupo, linhas: [] };
      secoes.push(sec);
    }
    const ultima = sec.linhas[sec.linhas.length - 1];
    if (ultima && n.tarefaId != null && ultima.principal.tarefaId === n.tarefaId && ultima.principal.tipo === n.tipo && ultima.principal.lida === n.lida) ultima.outros.push(n);
    else sec.linhas.push({ principal: n, outros: [] });
  }
  return secoes;
}

/** O título da aba com o número de não lidas na frente ("(3) Mesa"); sem não lidas, o título limpo. */
export function tituloComContagem(titulo: string, naoLidas: number): string {
  const limpo = titulo.replace(/^\(\d+\+?\)\s*/, "");
  return naoLidas > 0 ? `(${naoLidas > 99 ? "99+" : naoLidas}) ${limpo}` : limpo;
}

/** Quantos avisos a lista guarda na memória da tela (o resto sai — volta ao rolar). */
export const MAX_AVISOS_NA_TELA = 100;

/**
 * MESCLA a 1ª página recém-lida na lista da tela (o aviso AO VIVO): os novos entram no topo, os que mudaram (lida) são
 * trocados e os que SUMIRAM do intervalo da página (excluídos em outra aba) saem — as páginas já carregadas abaixo ficam.
 * `ocultos` = os que a tela está limpando (o "Desfazer" ainda vale): não voltam.
 */
export function mesclarPrimeiraPagina<T extends { id: number }>(atuais: readonly T[], pagina: readonly T[], temMais: boolean, ocultos: ReadonlySet<number> = new Set()): T[] {
  const nova = pagina.filter((x) => !ocultos.has(x.id));
  if (!pagina.length) return [];
  const menor = Math.min(...pagina.map((x) => x.id));
  const naPagina = new Set(pagina.map((x) => x.id));
  // Abaixo do intervalo da página: só os já carregados (as páginas seguintes), quando há mais.
  const abaixo = temMais ? atuais.filter((x) => x.id < menor && !naPagina.has(x.id)) : [];
  return [...nova, ...abaixo].slice(0, MAX_AVISOS_NA_TELA);
}
