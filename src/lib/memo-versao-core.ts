/**
 * MEMO PELA VERSÃO DOS DADOS — núcleo PURO (testado; relógio e versão injetados). Guarda o resultado de uma carga pesada
 * enquanto a VERSÃO dos dados (`versaoDados`, o sinal de "há dado novo") for a mesma e dentro da validade de segurança.
 * Guarda a PROMESSA: duas visitas simultâneas fazem UMA carga; uma falha não fica guardada. Tamanho limitado: a entrada
 * mais antiga sai primeiro (LRU pela ordem de inserção do `Map`).
 */

export type OpcoesMemo = {
  /** Máximo de entradas guardadas. */
  max: number;
  /** Validade de segurança (ms) — mesmo sem versão nova, a carga é refeita depois disso. */
  ttlMs: number;
  /** Relógio (ms). */
  agora: () => number;
};

type Entrada = { versao: string; em: number; valor: Promise<unknown> };

export function criarMemoVersao(op: OpcoesMemo) {
  const guardado = new Map<string, Entrada>();
  return {
    /** O valor da `chave` na `versao` — da memória quando vale, senão `carregar()` (e guarda). */
    obter<T>(chave: string, versao: string, carregar: () => Promise<T>): Promise<T> {
      const e = guardado.get(chave);
      if (e && e.versao === versao && op.agora() - e.em < op.ttlMs) {
        // Usada agora: vai para o fim (a mais antiga continua na frente para sair primeiro).
        guardado.delete(chave);
        guardado.set(chave, e);
        return e.valor as Promise<T>;
      }
      const valor = carregar();
      const nova: Entrada = { versao, em: op.agora(), valor };
      guardado.delete(chave);
      guardado.set(chave, nova);
      while (guardado.size > op.max) {
        const primeira = guardado.keys().next().value;
        if (primeira === undefined) break;
        guardado.delete(primeira);
      }
      // Falhou: sai da memória (a próxima visita tenta de novo) — só se ainda for a MESMA entrada.
      valor.catch(() => {
        if (guardado.get(chave) === nova) guardado.delete(chave);
      });
      return valor;
    },
    /** Quantas entradas estão guardadas (testes). */
    tamanho: () => guardado.size,
  };
}
