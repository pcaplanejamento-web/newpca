/**
 * O PROGRESSO de uma automação em execução (puro, testado): a % pelo TRABALHO de cada etapa (peso = quantos itens ela
 * trata — 1.302 DFDs pesam mais que uma leitura instantânea) e o TEMPO RESTANTE pelo ritmo real (as amostras recentes).
 */
export type EtapaProgresso = { estado?: string; /** 0..1 da etapa em curso (null = sem medida). */ fracao?: number | null; /** O trabalho da etapa (padrão 1). */ peso?: number };

const FINAIS = new Set(["ok", "erro", "ignorado"]);

/** A fração 0..1 da execução: cada etapa conta pelo peso; concluída = inteira; em curso = a fração medida. */
export function progressoFluxo(etapas: readonly EtapaProgresso[]): number {
  let total = 0;
  let feito = 0;
  for (const e of etapas) {
    const p = Math.max(0, e.peso ?? 1);
    total += p;
    if (FINAIS.has(e.estado ?? "")) feito += p;
    else if (e.estado === "rodando" && e.fracao != null) feito += p * Math.min(1, Math.max(0, e.fracao));
  }
  return total > 0 ? feito / total : 0;
}

export type Amostra = { t: number; f: number };
/** Janela do ritmo (ms): as amostras mais antigas que isso não contam — o ritmo segue o de agora. */
export const JANELA_RITMO_MS = 120_000;
/** Mínimo para estimar: tempo medido e avanço (sem isso, "calculando…"). */
const MIN_MS = 5_000;
const MIN_AVANCO = 0.005;

/** Guarda a amostra (tempo, fração) e descarta as fora da janela (mantém ao menos 2). */
export function registrarAmostra(amostras: readonly Amostra[], a: Amostra): Amostra[] {
  const ult = amostras.at(-1);
  if (ult && a.f < ult.f) return [a]; // recomeçou
  const lista = ult && ult.f === a.f ? amostras.slice() : [...amostras, a];
  const dentro = lista.filter((x) => a.t - x.t <= JANELA_RITMO_MS);
  return dentro.length >= 2 ? dentro : lista.slice(-2);
}

/** O tempo restante (ms) pelo ritmo das amostras; null = ainda sem medida confiável. */
export function tempoRestanteMs(amostras: readonly Amostra[], agora: number): number | null {
  if (amostras.length < 2) return null;
  const a = amostras[0];
  const b = amostras.at(-1) as Amostra;
  const dt = b.t - a.t;
  const df = b.f - a.f;
  if (dt < MIN_MS || df < MIN_AVANCO) return null;
  if (b.f >= 1) return 0;
  // O que falta no ritmo medido, menos o tempo já passado desde a última amostra (nunca negativo).
  return Math.max(0, ((1 - b.f) * dt) / df - (agora - b.t));
}

/** "≈ 12 min", "≈ 1 h 05 min", "< 1 min". */
export function textoDuracao(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return "< 1 min";
  if (min < 60) return `≈ ${min} min`;
  return `≈ ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

/** "37%" — nunca 100% antes de terminar. */
export const textoPct = (f: number, terminado = false) => `${terminado ? 100 : Math.min(99, Math.floor(f * 100))}%`;
