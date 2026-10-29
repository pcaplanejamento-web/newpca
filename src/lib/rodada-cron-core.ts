// A RODADA do cron: cada disparo chama o PRÓPRIO Worker (service binding `SELF`) várias vezes, em sequência. Cada chamada
// é uma execução NOVA, com o seu próprio limite de CPU e de consultas ao D1 — a importação automática faz várias tarefas
// pequenas por minuto em vez de uma. Esperar a resposta não gasta CPU de quem chama. Puro (testado).

/** Chamadas por rodada (o pai faz ≤ 8 subrequisições; 2 rodadas por minuto ≈ 23 mil requisições/dia no pior caso). */
export const MAX_CHAMADAS_RODADA = 8;
/** Tempo de uma rodada: os dois disparos da importação (0 s e 30 s) nunca se sobrepõem. */
export const MAX_MS_RODADA = 25_000;

export type RespostaVez = { ok: boolean; trabalhou: boolean };

/** Faz as chamadas da rodada até uma não trabalhar (nada a fazer, só espera), falhar, passar do tempo ou do teto. */
export async function rodadaDoCron(
  chamar: (vez: number) => Promise<RespostaVez>,
  agora: () => number = Date.now,
  limites = { chamadas: MAX_CHAMADAS_RODADA, ms: MAX_MS_RODADA },
): Promise<{ vezes: number; tarefas: number }> {
  const ini = agora();
  let tarefas = 0;
  let vez = 0;
  while (vez < limites.chamadas) {
    const r = await chamar(vez++);
    if (!r.ok || !r.trabalhou) break;
    tarefas++;
    if (agora() - ini >= limites.ms) break;
  }
  return { vezes: vez, tarefas };
}

/** A vez da chamada (o `?vez=` da rota interna) — fora do intervalo = 0. */
export function vezDaRodada(url: string): number {
  const n = Number(new URL(url).searchParams.get("vez"));
  return Number.isInteger(n) && n > 0 && n < MAX_CHAMADAS_RODADA ? n : 0;
}

/** Grava a situação na tela só no começo e no fim da rodada (o meio não multiplica as escritas no D1). */
export const registraNaVez = (vez: number, trabalhou: boolean) => vez === 0 || !trabalhou || vez === MAX_CHAMADAS_RODADA - 1;

/** A Frota trabalhou (leu ou dividiu um período)? As demais situações são espera/nada a fazer/erro. */
export const frotaTrabalhou = (feito: string) => /^(Lido |Período grande demais)/.test(feito);

/** O texto das tarefas feitas na rodada, para a situação geral. */
export const textoTarefas = (vez: number, trabalhou: boolean) => {
  const n = trabalhou ? vez + 1 : vez;
  return `${n} tarefa${n === 1 ? "" : "s"} na rodada`;
};
